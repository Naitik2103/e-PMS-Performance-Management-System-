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
      "SELECT rated_by_role, rating FROM quantitative_attribute_ratings WHERE appraisal_id = $1",
      [appraisalId]
    );

    const roScore = avg([
      ...kpa.rows.map((r) => ({ score: r.ro_rating })),
      ...attrs.rows.filter((r) => ["reporting_officer", "ReportingOfficer"].includes(r.rated_by_role))
    ]);
    const rewScore = avg([
      ...kpa.rows.map((r) => ({ score: r.revo_rating })),
      ...attrs.rows.filter((r) => ["reviewing_officer", "ReviewingOfficer"].includes(r.rated_by_role))
    ]);
    const aoScore = avg([
      ...kpa.rows.map((r) => ({ score: r.ao_rating })),
      ...attrs.rows.filter((r) => ["accepting_officer", "AcceptingOfficer"].includes(r.rated_by_role))
    ]);

    const finalScore = roScore * 0.7 + rewScore * 0.1 + aoScore * 0.2;
    
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
          "UPDATE score_summary SET ro_score = $1, rew_score = $2, ao_score = $3, final_score = $4, updated_at = NOW() WHERE id = $5",
          [roScore, rewScore, aoScore, finalScore, ssRes.rows[0].id]
        );
      } else {
        await client.query(`
          INSERT INTO score_summary (
            appraisal_id, rater_role, kpa_score, values_avg, competencies_avg, 
            personal_qualities_avg, knowledge_avg, ro_score, rew_score, ao_score, 
            overall_score, final_score, is_final
          ) VALUES (
            $1, 'system', 0, 0, 0, 0, 0, $2, $3, $4, 0, $5, false
          )
        `, [appraisalId, roScore, rewScore, aoScore, finalScore]);
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
