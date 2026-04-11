import { writeAudit } from "../services/auditService.js";
import { notifyUser } from "../services/notificationService.js";
import { ROLES } from "../constants/rbac.js";
import pool from "../config/db.js";
import { ensureIsROForAppraisal } from "../services/relationshipGuards.js";

const toNumber = (v) => Number(v || 0);

const getActiveOrByYearCycle = async (cycleId, year) => {
  if (cycleId) {
    const r = await pool.query("SELECT * FROM appraisal_cycles WHERE cycle_id = $1 LIMIT 1", [cycleId]);
    return r.rows[0] || null;
  }
  if (year) {
    const r = await pool.query(
      "SELECT * FROM appraisal_cycles WHERE cycle_year = $1 ORDER BY created_at DESC LIMIT 1",
      [String(year)]
    );
    return r.rows[0] || null;
  }
  const r = await pool.query(
    "SELECT * FROM appraisal_cycles WHERE status = 'active' ORDER BY activated_at DESC NULLS LAST, created_at DESC LIMIT 1"
  );
  return r.rows[0] || null;
};

const ensureAppraisal = async (employeeId, cycleId) => {
  const existing = await pool.query(
    "SELECT id, employee_id, cycle_id, ro_id, revo_id, ao_id, status FROM appraisals WHERE employee_id = $1 AND cycle_id = $2 LIMIT 1",
    [employeeId, cycleId]
  );
  if (existing.rows.length) return existing.rows[0];

  const p = await pool.query(
    `
    SELECT reporting_officer_id, reviewing_officer_id, accepting_officer_id
    FROM appraisal_cycle_participants
    WHERE cycle_id = $1 AND employee_id = $2
    LIMIT 1
    `,
    [cycleId, employeeId]
  );
  const row = p.rows[0] || {};
  if (!row.reporting_officer_id) {
    const err = new Error(
      "No Reporting Officer is assigned to you for this appraisal cycle. Please contact HR/Admin to set your reporting hierarchy."
    );
    err.statusCode = 400;
    throw err;
  }
  const inserted = await pool.query(
    `
    INSERT INTO appraisals (employee_id, cycle_id, ro_id, revo_id, ao_id, status)
    VALUES ($1,$2,$3,$4,$5,'draft')
    RETURNING id, employee_id, cycle_id, ro_id, revo_id, ao_id, status
    `,
    [employeeId, cycleId, row.reporting_officer_id || null, row.reviewing_officer_id || null, row.accepting_officer_id || null]
  );
  return inserted.rows[0];
};

const createGoal = async (req, res, next) => {
  try {
    const { cycleId, year, goalTitle, goalDescription, weightage } = req.body;
    const cycle = await getActiveOrByYearCycle(cycleId, year);
    if (!cycle) {
      res.status(400);
      return next(new Error("Appraisal cycle not found"));
    }

    const appraisal = await ensureAppraisal(req.user.id, cycle.cycle_id);

    const inserted = await pool.query(
      `
      INSERT INTO goals (goal_title, goal_description, user_id, weightage, status, cycle_id, appraisal_id, created_at, updated_at)
      VALUES ($1,$2,$3,$4,'draft',$5,$6,NOW(),NOW())
      RETURNING goal_id
      `,
      [goalTitle, goalDescription || null, req.user.id, Number(weightage), cycle.cycle_id, appraisal.id]
    );
    const goalId = inserted.rows[0].goal_id;

    await writeAudit({ user: req.user, action: "create", entity: "goal", entityId: goalId, details: { cycleId: cycle.cycle_id } });
    const out = await pool.query("SELECT * FROM goals WHERE goal_id = $1", [goalId]);
    return res.status(201).json(out.rows[0]);
  } catch (error) {
    return next(error);
  }
};

const updateGoal = async (req, res, next) => {
  try {
    const { id } = req.params;
    const r = await pool.query(
      "SELECT goal_id, status FROM goals WHERE goal_id = $1 AND user_id = $2 LIMIT 1",
      [id, req.user.id]
    );
    const goal = r.rows[0];
    if (!goal) {
      res.status(404);
      return next(new Error("Goal not found"));
    }
    if (!["draft", "returned"].includes(goal.status)) {
      res.status(400);
      return next(new Error("Goal cannot be edited at this stage"));
    }

    await pool.query(
      `
      UPDATE goals
      SET goal_title = $1, goal_description = $2, weightage = $3, updated_at = NOW()
      WHERE goal_id = $4 AND user_id = $5
      `,
      [req.body.goalTitle, req.body.goalDescription || null, Number(req.body.weightage), id, req.user.id]
    );

    await writeAudit({ user: req.user, action: "update", entity: "goal", entityId: id });
    const out = await pool.query("SELECT * FROM goals WHERE goal_id = $1", [id]);
    return res.json(out.rows[0]);
  } catch (error) {
    return next(error);
  }
};

const submitCycleGoals = async (req, res, next) => {
  try {
    const { cycleId, year } = req.body;
    const cycle = await getActiveOrByYearCycle(cycleId, year);
    if (!cycle) {
      res.status(400);
      return next(new Error("Appraisal cycle not found"));
    }

    const goals = await pool.query(
      "SELECT goal_id, weightage FROM goals WHERE user_id = $1 AND cycle_id = $2",
      [req.user.id, cycle.cycle_id]
    );
    if (!goals.rows.length) {
      res.status(400);
      return next(new Error("No goals found to submit"));
    }

    const totalWeight = goals.rows.reduce((sum, g) => sum + toNumber(g.weightage), 0);
    if (Math.round(totalWeight * 100) / 100 !== 100) {
      res.status(400);
      return next(new Error(`Total goal weightage must equal 100 for submission. Current: ${totalWeight}`));
    }

    await pool.query(
      "UPDATE goals SET status = 'submitted', updated_at = NOW() WHERE user_id = $1 AND cycle_id = $2",
      [req.user.id, cycle.cycle_id]
    );

    const employee = await pool.query(
      "SELECT first_name, last_name, email FROM users WHERE user_id = $1 LIMIT 1",
      [req.user.id]
    );
    const name =
      `${employee.rows[0]?.first_name || ""} ${employee.rows[0]?.last_name || ""}`.trim() || employee.rows[0]?.email;

    const roRow = await pool.query(
      `
      SELECT reporting_officer_id
      FROM appraisal_cycle_participants
      WHERE cycle_id = $1 AND employee_id = $2
      LIMIT 1
      `,
      [cycle.cycle_id, req.user.id]
    );
    const roId = roRow.rows[0]?.reporting_officer_id || null;
    if (roId) {
      await notifyUser({
        userId: roId,
        senderId: req.user.id,
        title: "Goal Submission Pending",
        message: `${name} has submitted goals for ${cycle.cycle_name}`,
        type: "goal_submission",
        entity: "goal",
        entityId: goals.rows[0].goal_id
      });
    }

    await writeAudit({ user: req.user, action: "submit", entity: "goal", details: { cycleId: cycle.cycle_id, count: goals.rows.length } });
    return res.json({ message: "Goals submitted", cycleId: cycle.cycle_id, totalWeight });
  } catch (error) {
    return next(error);
  }
};

const listMyGoals = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        g.goal_id,
        g.goal_title,
        g.goal_description,
        g.weightage,
        g.status,
        g.cycle_id,
        c.cycle_name,
        c.cycle_year
      FROM goals g
      LEFT JOIN appraisal_cycles c ON c.cycle_id = g.cycle_id
      WHERE g.user_id = $1
      ORDER BY g.created_at DESC
      `,
      [req.user.id]
    );

    const out = rows.map((g) => ({
      id: g.goal_id,
      goalTitle: g.goal_title,
      goalDescription: g.goal_description,
      weightage: g.weightage,
      status: g.status,
      cycleId: g.cycle_id,
      cycle: g.cycle_id
        ? { id: g.cycle_id, name: g.cycle_name, year: Number(g.cycle_year) }
        : null
    }));
    return res.json(out);
  } catch (error) {
    return next(error);
  }
};

const listAllGoals = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        g.goal_id,
        g.goal_title,
        g.goal_description,
        g.weightage,
        g.status,
        g.cycle_id,
        c.cycle_name,
        c.cycle_year,
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        d.name AS department
      FROM goals g
      LEFT JOIN appraisal_cycles c ON c.cycle_id = g.cycle_id
      LEFT JOIN users u ON u.user_id = g.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      ORDER BY g.created_at DESC
      `
    );
    const out = rows.map((g) => ({
      id: g.goal_id,
      goalTitle: g.goal_title,
      goalDescription: g.goal_description,
      weightage: g.weightage,
      status: g.status,
      cycleId: g.cycle_id,
      cycle: g.cycle_id ? { id: g.cycle_id, name: g.cycle_name, year: Number(g.cycle_year) } : null,
      employee: g.user_id
        ? { id: g.user_id, name: `${g.first_name || ""} ${g.last_name || ""}`.trim() || g.email, department: g.department }
        : null
    }));
    return res.json(out);
  } catch (error) {
    return next(error);
  }
};

const listGoalsForRO = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        g.goal_id,
        g.goal_title,
        g.goal_description,
        g.weightage,
        g.status,
        g.cycle_id,
        c.cycle_name,
        c.cycle_year,
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        d.name AS department
      FROM goals g
      JOIN appraisal_cycle_participants p ON p.cycle_id = g.cycle_id AND p.employee_id = g.user_id
      LEFT JOIN appraisal_cycles c ON c.cycle_id = g.cycle_id
      LEFT JOIN users u ON u.user_id = g.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE p.reporting_officer_id = $1 AND g.status = 'submitted'
      ORDER BY g.created_at DESC
      `,
      [req.user.id]
    );
    const out = rows.map((g) => ({
      id: g.goal_id,
      goalTitle: g.goal_title,
      goalDescription: g.goal_description,
      weightage: g.weightage,
      status: g.status,
      cycleId: g.cycle_id,
      cycle: g.cycle_id ? { id: g.cycle_id, name: g.cycle_name, year: Number(g.cycle_year) } : null,
      employee: { id: g.user_id, name: `${g.first_name || ""} ${g.last_name || ""}`.trim() || g.email, department: g.department }
    }));
    return res.json(out);
  } catch (error) {
    return next(error);
  }
};

const listGoalsForReviewing = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        g.goal_id,
        g.goal_title,
        g.goal_description,
        g.weightage,
        g.status,
        g.cycle_id,
        c.cycle_name,
        c.cycle_year,
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        d.name AS department
      FROM goals g
      JOIN appraisal_cycle_participants p ON p.cycle_id = g.cycle_id AND p.employee_id = g.user_id
      LEFT JOIN appraisal_cycles c ON c.cycle_id = g.cycle_id
      LEFT JOIN users u ON u.user_id = g.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE p.reviewing_officer_id = $1 AND g.status = 'approved'
      ORDER BY g.created_at DESC
      `,
      [req.user.id]
    );
    const out = rows.map((g) => ({
      id: g.goal_id,
      goalTitle: g.goal_title,
      goalDescription: g.goal_description,
      weightage: g.weightage,
      status: g.status,
      cycleId: g.cycle_id,
      cycle: g.cycle_id ? { id: g.cycle_id, name: g.cycle_name, year: Number(g.cycle_year) } : null,
      employee: { id: g.user_id, name: `${g.first_name || ""} ${g.last_name || ""}`.trim() || g.email, department: g.department }
    }));
    return res.json(out);
  } catch (error) {
    return next(error);
  }
};

const approveGoalByRO = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { remarks, decision = "approve" } = req.body;
    const goalRes = await pool.query("SELECT goal_id, user_id, status, goal_title, cycle_id FROM goals WHERE goal_id = $1 LIMIT 1", [id]);
    const goal = goalRes.rows[0];
    if (!goal) {
      res.status(404);
      return next(new Error("Goal not found or not in your team"));
    }

    const p = await pool.query(
      "SELECT reporting_officer_id FROM appraisal_cycle_participants WHERE cycle_id = $1 AND employee_id = $2 LIMIT 1",
      [goal.cycle_id, goal.user_id]
    );
    if (!p.rows.length || p.rows[0].reporting_officer_id !== req.user.id) {
      res.status(403);
      return next(new Error("Goal not found or not in your team"));
    }

    if (goal.status !== "submitted") {
      res.status(400);
      return next(new Error("Goal is not ready for RO action"));
    }

    const nextStatus = decision === "return" ? "returned" : "approved";
    await pool.query(
      "UPDATE goals SET status = $1, ro_approval_remarks = $2, updated_at = NOW() WHERE goal_id = $3",
      [nextStatus, remarks || null, id]
    );

    await notifyUser({
      userId: goal.user_id,
      senderId: req.user.id,
      title: "Goal Reviewed by Reporting Officer",
      message: `Your goal \"${goal.goal_title}\" was ${nextStatus}.`,
      type: "goal_review",
      entity: "goal",
      entityId: id
    });

    await writeAudit({ user: req.user, action: nextStatus === "approved" ? "approve" : "return", entity: "goal", entityId: id });
    const out = await pool.query("SELECT * FROM goals WHERE goal_id = $1", [id]);
    return res.json(out.rows[0]);
  } catch (error) {
    return next(error);
  }
};

const approveGoalByReviewing = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { remarks, decision = "approve" } = req.body;
    const goalRes = await pool.query("SELECT goal_id, user_id, status, cycle_id, goal_title FROM goals WHERE goal_id = $1 LIMIT 1", [id]);
    const goal = goalRes.rows[0];
    if (!goal) {
      res.status(404);
      return next(new Error("Goal not found"));
    }
    if (goal.status !== "approved") {
      res.status(400);
      return next(new Error("Goal is not ready for Reviewing Officer action"));
    }

    const p = await pool.query(
      "SELECT reviewing_officer_id FROM appraisal_cycle_participants WHERE cycle_id = $1 AND employee_id = $2 LIMIT 1",
      [goal.cycle_id, goal.user_id]
    );
    if (!p.rows.length || p.rows[0].reviewing_officer_id !== req.user.id) {
      res.status(403);
      return next(new Error("Access denied for this goal"));
    }

    const nextStatus = decision === "return" ? "returned" : "approved";
    await pool.query(
      "UPDATE goals SET status = $1, updated_at = NOW() WHERE goal_id = $2",
      [nextStatus, id]
    );

    await notifyUser({
      userId: goal.user_id,
      senderId: req.user.id,
      title: "Goal Reviewed by Reviewing Officer",
      message: `Your goal \"${goal.goal_title}\" was ${nextStatus}.`,
      type: "goal_review",
      entity: "goal",
      entityId: id
    });

    await writeAudit({ user: req.user, action: decision === "return" ? "return" : "approve", entity: "goal", entityId: id });
    const out = await pool.query("SELECT * FROM goals WHERE goal_id = $1", [id]);
    return res.json(out.rows[0]);
  } catch (error) {
    return next(error);
  }
};

const resolveReviewAndGoals = async (appraisalId) => {
  const review = await pool.query("SELECT * FROM appraisals WHERE id = $1 LIMIT 1", [appraisalId]);
  if (!review.rows.length) return { review: null, goals: [] };
  const r = review.rows[0];
  const goals = await pool.query("SELECT * FROM goals WHERE appraisal_id = $1 ORDER BY display_order NULLS LAST, created_at ASC", [
    appraisalId
  ]);
  return { review: r, goals: goals.rows };
};

const getGoalsByAppraisalId = async (req, res, next) => {
  try {
    const { appraisalId } = req.params;
    const { review, goals } = await resolveReviewAndGoals(appraisalId);
    if (!review) return res.status(404).json({ error: "Appraisal not found" });
    return res.json(goals);
  } catch (error) {
    return next(error);
  }
};

const updateGoalsByAppraisalId = async (req, res, next) => {
  try {
    const { appraisalId } = req.params;
    const { review, goals } = await resolveReviewAndGoals(appraisalId);
    if (!review) return res.status(404).json({ error: "Appraisal not found" });
    if (review.employee_id !== req.user.userId) return res.status(403).json({ error: "This appraisal is not assigned to you" });
    if (review.status !== "draft") {
      return res.status(409).json({ error: "Action not allowed in current appraisal state", required: "draft", current: review.status });
    }
    const updates = Array.isArray(req.body?.goals) ? req.body.goals : [];
    for (const update of updates) {
      const goal = goals.find((g) => g.goal_id === update.id || g.goal_id === update.goal_id);
      if (!goal) continue;
      await pool.query(
        "UPDATE goals SET goal_title = COALESCE($1, goal_title), goal_description = COALESCE($2, goal_description), weightage = COALESCE($3, weightage), updated_at = NOW() WHERE goal_id = $4",
        [
          update.kpa_title ?? update.goalTitle ?? null,
          update.description ?? update.goalDescription ?? null,
          update.weightage ?? null,
          goal.goal_id
        ]
      );
    }
    return res.json({ message: "Goals updated" });
  } catch (error) {
    return next(error);
  }
};

const submitGoalsByAppraisalId = async (req, res, next) => {
  try {
    const { appraisalId } = req.params;
    const { review, goals } = await resolveReviewAndGoals(appraisalId);
    if (!review) return res.status(404).json({ error: "Appraisal not found" });
    if (review.employee_id !== req.user.userId) return res.status(403).json({ error: "This appraisal is not assigned to you" });
    if (review.status !== "draft") {
      return res.status(409).json({ error: "Action not allowed in current appraisal state", required: "draft", current: review.status });
    }
    const totalWeight = goals.reduce((sum, g) => sum + Number(g.weightage || 0), 0);
    if (Math.round(totalWeight * 100) / 100 !== 100) {
      return res.status(400).json({ error: "Validation error", details: ["Total goal weightage must equal 100"] });
    }
    await pool.query("UPDATE goals SET status = 'submitted', updated_at = NOW() WHERE appraisal_id = $1", [appraisalId]);
    await pool.query("UPDATE appraisals SET status = 'submitted', goals_submitted_at = NOW() WHERE id = $1", [appraisalId]);
    return res.json({ message: "Goals submitted" });
  } catch (error) {
    return next(error);
  }
};

const approveGoalsByAppraisalId = async (req, res, next) => {
  try {
    const { appraisalId } = req.params;
    const { review } = await resolveReviewAndGoals(appraisalId);
    if (!review) return res.status(404).json({ error: "Appraisal not found" });
    if (review.status !== "submitted") {
      return res.status(409).json({ error: "Action not allowed in current appraisal state", required: "submitted", current: review.status });
    }
    const ownership = await ensureIsROForAppraisal(appraisalId, req.user.userId);
    if (!ownership.ok) return res.status(ownership.error === "Appraisal not found" ? 404 : 403).json({ error: ownership.error });
    await pool.query("UPDATE goals SET status = 'approved', updated_at = NOW() WHERE appraisal_id = $1", [appraisalId]);
    await pool.query("UPDATE appraisals SET status = 'ro_approved', goals_approved_at = NOW() WHERE id = $1", [appraisalId]);
    return res.json({ message: "Goals approved" });
  } catch (error) {
    return next(error);
  }
};

const sendbackGoalsByAppraisalId = async (req, res, next) => {
  try {
    const { appraisalId } = req.params;
    const { review } = await resolveReviewAndGoals(appraisalId);
    if (!review) return res.status(404).json({ error: "Appraisal not found" });
    if (review.status !== "submitted") {
      return res.status(409).json({ error: "Action not allowed in current appraisal state", required: "submitted", current: review.status });
    }
    const ownership = await ensureIsROForAppraisal(appraisalId, req.user.userId);
    if (!ownership.ok) return res.status(ownership.error === "Appraisal not found" ? 404 : 403).json({ error: ownership.error });
    await pool.query("UPDATE goals SET status = 'returned', updated_at = NOW() WHERE appraisal_id = $1", [appraisalId]);
    await pool.query("UPDATE appraisals SET status = 'draft' WHERE id = $1", [appraisalId]);
    return res.json({ message: "Goals sent back" });
  } catch (error) {
    return next(error);
  }
};

export {
  createGoal,
  updateGoal,
  submitCycleGoals,
  listMyGoals,
  listAllGoals,
  listGoalsForRO,
  listGoalsForReviewing,
  approveGoalByRO,
  approveGoalByReviewing,
  getGoalsByAppraisalId,
  updateGoalsByAppraisalId,
  submitGoalsByAppraisalId,
  approveGoalsByAppraisalId,
  sendbackGoalsByAppraisalId
};
