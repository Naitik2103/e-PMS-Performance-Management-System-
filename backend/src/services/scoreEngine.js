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
    await client.query(
      "UPDATE appraisals SET ro_score = $1, revo_score = $2, ao_score = $3, final_score = $4, updated_at = NOW() WHERE id = $5",
      [roScore, rewScore, aoScore, finalScore, appraisalId]
    );

    await writeAudit({
      user: { userId: actorId, role: null },
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
