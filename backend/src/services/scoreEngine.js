import pool from "../config/db.js";
import { writeAudit } from "./auditService.js";

const avg = (rows) => {
  if (!rows.length) return 0;
  return rows.reduce((s, r) => s + Number(r.score || r.rating || 0), 0) / rows.length;
};

const computeScore = async (appraisalId, { actorId, transaction } = {}) => {
  const client = transaction || pool;
  try {
    const appRes = await client.query("SELECT id FROM appraisals WHERE id = $1 LIMIT 1", [appraisalId]);
    if (!appRes.rows.length) throw new Error("Appraisal not found");

    const kpa = await client.query(
      "SELECT ro_rating, revo_rating, ao_rating FROM appraisal_ratings WHERE appraisal_id = $1",
      [appraisalId]
    );
    const attrs = await client.query(
      "SELECT rater_role, rating, category FROM quantitative_attribute_rating WHERE appraisal_id = $1",
      [appraisalId]
    );

    const roScore = avg([
      ...kpa.rows.map((r) => ({ score: r.ro_rating })),
      ...attrs.rows.filter((r) => ["reporting_officer", "ReportingOfficer"].includes(r.rater_role))
    ]);
    const rewScore = avg([
      ...kpa.rows.map((r) => ({ score: r.revo_rating })),
      ...attrs.rows.filter((r) => ["reviewing_officer", "ReviewingOfficer"].includes(r.rater_role))
    ]);
    const aoScore = avg([
      ...kpa.rows.map((r) => ({ score: r.ao_rating })),
      ...attrs.rows.filter((r) => ["accepting_officer", "AcceptingOfficer"].includes(r.rater_role))
    ]);

    const finalScore = roScore * 0.7 + rewScore * 0.1 + aoScore * 0.2;

    const getCategoryAvg = (ratings, roleKeywords, catKeyword) => {
      const filtered = ratings.filter(r => roleKeywords.includes(r.rater_role) && String(r.category || "").toLowerCase().includes(catKeyword));
      return avg(filtered);
    };

    const roVals = getCategoryAvg(attrs.rows, ["reporting_officer", "ReportingOfficer"], "values");
    const rewVals = getCategoryAvg(attrs.rows, ["reviewing_officer", "ReviewingOfficer"], "values");
    const aoVals = getCategoryAvg(attrs.rows, ["accepting_officer", "AcceptingOfficer"], "values");
    const valuesAvg = roVals * 0.7 + rewVals * 0.1 + aoVals * 0.2;

    const roComp = getCategoryAvg(attrs.rows, ["reporting_officer", "ReportingOfficer"], "competen");
    const rewComp = getCategoryAvg(attrs.rows, ["reviewing_officer", "ReviewingOfficer"], "competen");
    const aoComp = getCategoryAvg(attrs.rows, ["accepting_officer", "AcceptingOfficer"], "competen");
    const competenciesAvg = roComp * 0.7 + rewComp * 0.1 + aoComp * 0.2;

    const roPers = getCategoryAvg(attrs.rows, ["reporting_officer", "ReportingOfficer"], "personal");
    const rewPers = getCategoryAvg(attrs.rows, ["reviewing_officer", "ReviewingOfficer"], "personal");
    const aoPers = getCategoryAvg(attrs.rows, ["accepting_officer", "AcceptingOfficer"], "personal");
    const personalQualitiesAvg = roPers * 0.7 + rewPers * 0.1 + aoPers * 0.2;

    const roKnow = getCategoryAvg(attrs.rows, ["reporting_officer", "ReportingOfficer"], "knowledge");
    const rewKnow = getCategoryAvg(attrs.rows, ["reviewing_officer", "ReviewingOfficer"], "knowledge");
    const aoKnow = getCategoryAvg(attrs.rows, ["accepting_officer", "AcceptingOfficer"], "knowledge");
    const knowledgeAvg = roKnow * 0.7 + rewKnow * 0.1 + aoKnow * 0.2;

    const roKpa = avg(kpa.rows.map(r => ({ score: r.ro_rating })));
    const rewKpa = avg(kpa.rows.map(r => ({ score: r.revo_rating })));
    const aoKpa = avg(kpa.rows.map(r => ({ score: r.ao_rating })));
    const kpaScore = roKpa * 0.7 + rewKpa * 0.1 + aoKpa * 0.2;
    
    // Check if score columns exist before updating
    const colsRes = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'appraisals'"
    );
    const cols = new Set(colsRes.rows.map(r => r.column_name));
    
    if (cols.has("ro_score") && cols.has("final_score")) {
      await client.query(
        "UPDATE appraisals SET ro_score = $1, revo_score = $2, ao_score = $3, final_score = $4, updated_at = NOW() WHERE id = $5",
        [roScore, rewScore, aoScore, finalScore, appraisalId]
      );
    }

    // Insert/Update score_summary table
    const ssTableRes = await client.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'score_summary')");
    if (ssTableRes.rows[0].exists) {
      const ssRes = await client.query("SELECT id FROM score_summary WHERE appraisal_id = $1 LIMIT 1", [appraisalId]);
      if (ssRes.rows.length) {
        await client.query(
          "UPDATE score_summary SET kpa_score = $1, values_avg = $2, competencies_avg = $3, personal_qualities_avg = $4, knowledge_avg = $5, ro_score = $6, rew_score = $7, ao_score = $8, final_score = $9, updated_at = NOW() WHERE id = $10",
          [kpaScore, valuesAvg, competenciesAvg, personalQualitiesAvg, knowledgeAvg, roScore, rewScore, aoScore, finalScore, ssRes.rows[0].id]
        );
      } else {
        await client.query(`
          INSERT INTO score_summary (
            appraisal_id, rater_role, kpa_score, values_avg, competencies_avg, 
            personal_qualities_avg, knowledge_avg, ro_score, rew_score, ao_score, 
            overall_score, final_score, is_final
          ) VALUES (
            $1, 'system', $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, false
          )
        `, [appraisalId, kpaScore, valuesAvg, competenciesAvg, personalQualitiesAvg, knowledgeAvg, roScore, rewScore, aoScore, finalScore]);
      }
    }

    await writeAudit({
      user: { userId: actorId, role: 'ReportingOfficer' },
      action: "appraisal_completed",
      entity: "appraisal",
      entityId: appraisalId,
      details: { roScore, rewScore, aoScore, finalScore }
    });

    return { roScore, rewScore, aoScore, finalScore };
  } catch (error) {
    throw error;
  }
};

export { computeScore };
