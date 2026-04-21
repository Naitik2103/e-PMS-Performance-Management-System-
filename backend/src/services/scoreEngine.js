import pool from "../config/db.js";
import { writeAudit } from "./auditService.js";
import { ROLES, normalizeRole } from "../constants/rbac.js";

const toNumber = (v) => Number(v || 0);
const roundTo = (num, decimals = 4) => {
  const factor = Math.pow(10, decimals);
  return Math.round((num + Number.EPSILON) * factor) / factor;
};

const getWeights = () => ({
  KPA: toNumber(process.env.KPA_WEIGHT),
  COMPETENCIES: toNumber(process.env.COMPETENCIES_WEIGHT),
  VALUES: toNumber(process.env.VALUES_WEIGHT),
  PERSONAL: toNumber(process.env.PERSONAL_ATTRIBUTES_WEIGHT),
  KNOWLEDGE: toNumber(process.env.KNOWLEDGE_WEIGHT),
});

const getRoleWeights = () => {
  const ro = process.env.RO_WEIGHT;
  const revo = process.env.REVO_WEIGHT;
  const ao = process.env.AO_WEIGHT;
  if (ro !== undefined && revo !== undefined && ao !== undefined) {
    return {
      RO: toNumber(ro),
      REVO: toNumber(revo),
      AO: toNumber(ao),
    };
  }
  return { RO: 1 / 3, REVO: 1 / 3, AO: 1 / 3 };
};

const mapGrade = (score) => {
  if (score >= 4.5) return "Outstanding";
  if (score >= 3.5) return "Very Good";
  if (score >= 2.5) return "Good";
  if (score >= 1.5) return "Average";
  return "Needs Improvement";
};

const computeScore = async (appraisalId, { actorId, transaction } = {}) => {
  const client = transaction || pool;
  try {
    const appRes = await client.query(
      "SELECT id, status FROM appraisals WHERE id = $1 LIMIT 1",
      [appraisalId]
    );
    if (!appRes.rows.length) throw new Error("Appraisal not found");
    const appraisal = appRes.rows[0];

    // 1. Fetch Goals for KPA calculation
    const goalsRes = await client.query(
      "SELECT goal_id, weightage FROM goals WHERE appraisal_id = $1",
      [appraisalId]
    );
    const goals = goalsRes.rows;

    // 2. Fetch Ratings
    const kpaRatingsRes = await client.query(
      "SELECT goal_id, ro_rating, revo_rating, ao_rating FROM appraisal_ratings WHERE appraisal_id = $1",
      [appraisalId]
    );
    const kpaRatings = kpaRatingsRes.rows;

    const attrRatingsRes = await client.query(
      "SELECT rater_role, rating, category FROM quantitative_attribute_rating WHERE appraisal_id = $1",
      [appraisalId]
    );
    const attrRatings = attrRatingsRes.rows;

    // Helper for category averages
    const getCategoryAvg = (ratings, role, category) => {
      const normalizedTargetRole = normalizeRole(role);
      const filtered = ratings.filter(
        (r) =>
          normalizeRole(r.rater_role) === normalizedTargetRole &&
          String(r.category || "")
            .toLowerCase()
            .trim() === category.toLowerCase().trim()
      );
      if (!filtered.length) return 0;
      const sum = filtered.reduce((acc, r) => acc + toNumber(r.rating), 0);
      return roundTo(sum / filtered.length);
    };

    // Helper for KPA weighted score
    const getKpaScore = (ratings, roleField) => {
      if (!goals.length) return 0;
      let totalWeightedRating = 0;
      for (const goal of goals) {
        const ratingRow = ratings.find((r) => r.goal_id === goal.goal_id);
        const rating = toNumber(ratingRow ? ratingRow[roleField] : 0);
        const weight = toNumber(goal.weightage);
        totalWeightedRating += weight * rating;
      }
      return roundTo(totalWeightedRating / 100);
    };

    const roles = [
      { role: ROLES.REPORTING_OFFICER, field: "ro" },
      { role: ROLES.REVIEWING_OFFICER, field: "revo" },
      { role: ROLES.ACCEPTING_OFFICER, field: "ao" },
    ];

    const results = {};
    const weights = getWeights();

    for (const r of roles) {
      const kpaScore = getKpaScore(kpaRatings, `${r.field}_rating`);
      const valAvg = getCategoryAvg(attrRatings, r.role, "values");
      const compAvg = getCategoryAvg(attrRatings, r.role, "competencies");
      const persAvg = getCategoryAvg(attrRatings, r.role, "personal_qualities");
      const knowAvg = getCategoryAvg(attrRatings, r.role, "knowledge");

      const overall = roundTo(
        kpaScore * weights.KPA +
        valAvg * weights.VALUES +
        compAvg * weights.COMPETENCIES +
        persAvg * weights.PERSONAL +
        knowAvg * weights.KNOWLEDGE
      );

      results[r.field] = {
        kpa: kpaScore,
        values: valAvg,
        competencies: compAvg,
        personal: persAvg,
        knowledge: knowAvg,
        overall: overall,
      };
    }

    const roleWeights = getRoleWeights();
    const finalScore = roundTo(
      results.ro.overall * roleWeights.RO +
      results.revo.overall * roleWeights.REVO +
      results.ao.overall * roleWeights.AO
    );

    const grade = mapGrade(finalScore);

    // Blended averages for legacy compatibility (simple average or weighted?)
    // User wants these stored, so we'll store the direct blended averages too.
    const blended = {
      kpa: roundTo((results.ro.kpa + results.revo.kpa + results.ao.kpa) / 3),
      values: roundTo((results.ro.values + results.revo.values + results.ao.values) / 3),
      competencies: roundTo(
        (results.ro.competencies +
          results.revo.competencies +
          results.ao.competencies) /
        3
      ),
      personal: roundTo((results.ro.personal + results.revo.personal + results.ao.personal) / 3),
      knowledge: roundTo(
        (results.ro.knowledge + results.revo.knowledge + results.ao.knowledge) /
        3
      ),
    };

    // 3. Persist to score_summary
    const isFinal = appraisal.status === "completed" || appraisal.status === "ao_accepted";
    
    const ssUpsertQuery = `
      INSERT INTO score_summary (
        appraisal_id, rater_role, 
        kpa_score, values_avg, competencies_avg, personal_qualities_avg, knowledge_avg,
        ro_score, rew_score, ao_score, overall_score, final_score, grade, is_final,
        ro_kpa_score, ro_values_avg, ro_competencies_avg, ro_personal_avg, ro_knowledge_avg,
        revo_kpa_score, revo_values_avg, revo_competencies_avg, revo_personal_avg, revo_knowledge_avg,
        ao_kpa_score, ao_values_avg, ao_competencies_avg, ao_personal_avg, ao_knowledge_avg,
        computed_at, created_at, updated_at
      ) VALUES (
        $1, 'system',
        $2, $3, $4, $5, $6,
        $7, $8, $9, 0, $10, $11, $12,
        $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22,
        $23, $24, $25, $26, $27,
        NOW(), NOW(), NOW()
      )
      ON CONFLICT (appraisal_id) DO UPDATE SET
        kpa_score = EXCLUDED.kpa_score,
        values_avg = EXCLUDED.values_avg,
        competencies_avg = EXCLUDED.competencies_avg,
        personal_qualities_avg = EXCLUDED.personal_qualities_avg,
        knowledge_avg = EXCLUDED.knowledge_avg,
        ro_score = EXCLUDED.ro_score,
        rew_score = EXCLUDED.rew_score,
        ao_score = EXCLUDED.ao_score,
        overall_score = EXCLUDED.overall_score,
        final_score = EXCLUDED.final_score,
        grade = EXCLUDED.grade,
        is_final = EXCLUDED.is_final,
        ro_kpa_score = EXCLUDED.ro_kpa_score,
        ro_values_avg = EXCLUDED.ro_values_avg,
        ro_competencies_avg = EXCLUDED.ro_competencies_avg,
        ro_personal_avg = EXCLUDED.ro_personal_avg,
        ro_knowledge_avg = EXCLUDED.ro_knowledge_avg,
        revo_kpa_score = EXCLUDED.revo_kpa_score,
        revo_values_avg = EXCLUDED.revo_values_avg,
        revo_competencies_avg = EXCLUDED.revo_competencies_avg,
        revo_personal_avg = EXCLUDED.revo_personal_avg,
        revo_knowledge_avg = EXCLUDED.revo_knowledge_avg,
        ao_kpa_score = EXCLUDED.ao_kpa_score,
        ao_values_avg = EXCLUDED.ao_values_avg,
        ao_competencies_avg = EXCLUDED.ao_competencies_avg,
        ao_personal_avg = EXCLUDED.ao_personal_avg,
        ao_knowledge_avg = EXCLUDED.ao_knowledge_avg,
        updated_at = NOW()
    `;

    await client.query(ssUpsertQuery, [
      appraisalId,
      blended.kpa, blended.values, blended.competencies, blended.personal, blended.knowledge,
      results.ro.overall, results.revo.overall, results.ao.overall,
      finalScore, grade, isFinal,
      results.ro.kpa, results.ro.values, results.ro.competencies, results.ro.personal, results.ro.knowledge,
      results.revo.kpa, results.revo.values, results.revo.competencies, results.revo.personal, results.revo.knowledge,
      results.ao.kpa, results.ao.values, results.ao.competencies, results.ao.personal, results.ao.knowledge
    ]);

    await writeAudit({
      user: { userId: actorId, role: ROLES.REPORTING_OFFICER }, // Generic actor for background audit
      action: isFinal ? "appraisal_completed_final" : "appraisal_score_updated",
      entity: "appraisal",
      entityId: appraisalId,
      details: { finalScore, grade, isFinal },
    });

    return { roScore: results.ro.overall, rewScore: results.revo.overall, aoScore: results.ao.overall, finalScore, grade };
  } catch (error) {
    console.error("ScoreEngine calculation error:", error);
    throw error;
  }
};

export { computeScore };
