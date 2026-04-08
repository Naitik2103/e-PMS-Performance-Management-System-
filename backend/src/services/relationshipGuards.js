import pool from "../config/db.js";

const getAppraisalById = async (appraisalId) => {
  const { rows } = await pool.query("SELECT id, employee_id, cycle_id, ro_id, revo_id, ao_id FROM appraisals WHERE id = $1 LIMIT 1", [
    appraisalId
  ]);
  return rows[0] || null;
};

const ensureIsROForAppraisal = async (appraisalId, userId) => {
  const appraisal = await getAppraisalById(appraisalId);
  if (!appraisal) return { ok: false, error: "Appraisal not found" };
  if (String(appraisal.ro_id) !== String(userId)) return { ok: false, error: "This appraisal is not assigned to you" };
  return { ok: true, appraisal };
};

const ensureIsRevOForAppraisal = async (appraisalId, userId) => {
  const appraisal = await getAppraisalById(appraisalId);
  if (!appraisal) return { ok: false, error: "Appraisal not found" };
  if (String(appraisal.revo_id) !== String(userId)) return { ok: false, error: "This appraisal is not assigned to you" };
  return { ok: true, appraisal };
};

const ensureIsAOForAppraisal = async (appraisalId, userId) => {
  const appraisal = await getAppraisalById(appraisalId);
  if (!appraisal) return { ok: false, error: "Appraisal not found" };
  if (String(appraisal.ao_id) !== String(userId)) return { ok: false, error: "This appraisal is not assigned to you" };
  return { ok: true, appraisal };
};

export { ensureIsROForAppraisal, ensureIsRevOForAppraisal, ensureIsAOForAppraisal };

