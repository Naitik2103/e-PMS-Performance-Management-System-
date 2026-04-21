import express from "express";
import pool from "../config/db.js";
import { authenticateJWT, authorizeContext } from "../middleware/adminApiAuth.js";
import { buildEvaluatesGraph, wouldCreateCycle } from "../utils/participantAlgorithm.js";

const router = express.Router();
router.use(authenticateJWT, authorizeContext("hr_admin"));

// GET /api/users/with-levels
router.get("/users/with-levels", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        u.user_id AS id,
        COALESCE(NULLIF(TRIM(u.full_name), ''), CONCAT_WS(' ', u.first_name, u.last_name)) AS name,
        COALESCE(u.org_level, 1) AS org_level,
        u.reporting_to AS reporting_to
      FROM users u
      WHERE u.is_active = true
      ORDER BY COALESCE(NULLIF(TRIM(u.full_name), ''), CONCAT_WS(' ', u.first_name, u.last_name))
      `
    );
    return res.json(rows);
  } catch (e) {
    return next(e);
  }
});

// GET /api/appraisal-cycles/:cycleId/participants
router.get("/appraisal-cycles/:cycleId/participants", async (req, res, next) => {
  try {
    const { cycleId } = req.params;
    const { rows } = await pool.query(
      `
      SELECT
        p.employee_id AS employee_id,
        p.reporting_officer_id AS ro_id,
        p.reviewing_officer_id AS revo_id,
        p.accepting_officer_id AS ao_id
      FROM appraisal_cycle_participants p
      JOIN users u ON u.user_id = p.employee_id
      WHERE p.cycle_id = $1
        AND u.is_active = true
      ORDER BY p.employee_id
      `,
      [cycleId]
    );
    return res.json(rows);
  } catch (e) {
    return next(e);
  }
});

const softLevelWarnings = (usersById, roId, revoId, aoId) => {
  const warnings = [];
  const ro = roId ? usersById.get(String(roId)) : null;
  const revo = revoId ? usersById.get(String(revoId)) : null;
  const ao = aoId ? usersById.get(String(aoId)) : null;
  const roLevel = ro ? Number(ro.org_level) || 1 : null;
  const revoLevel = revo ? Number(revo.org_level) || 1 : null;
  const aoLevel = ao ? Number(ao.org_level) || 1 : null;

  if (roLevel != null && revoLevel != null && !(revoLevel > roLevel)) {
    warnings.push("Org-level check: RevO should be at a higher organizational level than RO.");
  }
  if (revoLevel != null && aoLevel != null && !(aoLevel > revoLevel)) {
    warnings.push("Org-level check: AO should be at a higher organizational level than RevO.");
  }
  return warnings;
};

// PUT /api/appraisal-cycles/:cycleId/participants/:employeeId
router.put("/appraisal-cycles/:cycleId/participants/:employeeId", async (req, res, next) => {
  try {
    const { cycleId, employeeId } = req.params;
    const employee = String(employeeId);

    const ro_id = req.body?.ro_id ?? null;
    const revo_id = req.body?.revo_id ?? null;
    const ao_id = req.body?.ao_id ?? null;

    const ro = ro_id ? String(ro_id) : null;
    const revo = revo_id ? String(revo_id) : null;
    const ao = ao_id ? String(ao_id) : null;

    // Hard validations (duplicates/self).
    const hardErrors = [];
    const ids = [ro, revo, ao].filter(Boolean);
    // Rule removed: RO, RevO, and AO CAN be the same person now to allow for cascading.
    if (ro && ro === employee) hardErrors.push("ro_id cannot equal employee_id.");
    if (revo && revo === employee) hardErrors.push("revo_id cannot equal employee_id.");
    if (ao && ao === employee) hardErrors.push("ao_id cannot equal employee_id.");
    if (hardErrors.length) return res.status(422).json({ errors: hardErrors });

    // Load all participants for cycle, apply patch for the current employee, and run cycle detection.
    const { rows: participants } = await pool.query(
      `
      SELECT
        p.employee_id,
        p.reporting_officer_id AS ro_id,
        p.reviewing_officer_id AS revo_id,
        p.accepting_officer_id AS ao_id
      FROM appraisal_cycle_participants p
      JOIN users u ON u.user_id = p.employee_id
      WHERE p.cycle_id = $1
        AND u.is_active = true
      `,
      [cycleId]
    );

    const patched = participants.map((p) =>
      String(p.employee_id) === employee ? { ...p, ro_id: ro, revo_id: revo, ao_id: ao } : p
    );
    const graph = buildEvaluatesGraph(patched);

    for (const evaluator of [ro, revo, ao].filter(Boolean)) {
      if (wouldCreateCycle(String(evaluator), employee, graph)) {
        return res.status(422).json({ errors: ["This assignment would create a circular evaluation (cycle)."] });
      }
    }

    // Soft org-level warnings (save anyway).
    const { rows: users } = await pool.query(
      `
      SELECT user_id AS id, COALESCE(org_level, 1) AS org_level
      FROM users
      WHERE is_active = true
      `
    );
    const usersById = new Map(users.map((u) => [String(u.id), u]));
    const warnings = softLevelWarnings(usersById, ro, revo, ao);

    // RATER CASCADE LOGIC:
    // 1. If RevO is blank, it MUST follow RO.
    const finalRevo = revo || ro;
    // 2. If AO is blank, it MUST follow RevO.
    const finalAo = ao || finalRevo;

    // 1. Update the Participant mapping table
    const upd = await pool.query(
      `
      UPDATE appraisal_cycle_participants
      SET
        reporting_officer_id = $3,
        reviewing_officer_id = $4,
        accepting_officer_id = $5,
        updated_at = NOW()
      WHERE cycle_id = $1 AND employee_id = $2
      `,
      [cycleId, employee, ro, finalRevo, finalAo]
    );

    if (upd.rowCount === 0) return res.status(404).json({ error: "Participant not found for this cycle." });

    // 2. Sync to active appraisals table
    // Ensures mid-cycle hierarchy changes are reflected on the dashboard immediately.
    await pool.query(
      `
      UPDATE appraisals
      SET
        ro_id = $3,
        revo_id = $4,
        ao_id = $5
      WHERE employee_id = $1 AND cycle_id = $2
      `,
      [employee, cycleId, ro, finalRevo, finalAo]
    );

    return res.json({ 
      employee_id: employee, 
      ro_id: ro, 
      revo_id: finalRevo, 
      ao_id: finalAo, 
      warnings 
    });
  } catch (e) {
    return next(e);
  }
});

export default router;

