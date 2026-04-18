import { writeAudit } from "../services/auditService.js";
import { notifyUser } from "../services/notificationService.js";
import pool from "../config/db.js";
import { ROLES } from "../constants/rbac.js";
import { assertCycleWindowOpen } from "../services/cycleAccess.js";

// Helper: Convert snake_case database columns to camelCase for frontend
const formatTrackingRecord = (row) => ({
  id: row.review_id,
  reviewId: row.review_id,
  employeeId: row.employee_id,
  goalId: row.goal_id,
  cycleId: row.cycle_id,
  appraisalId: row.appraisal_id,
  progressText: row.progress_text,
  status: row.status,
  submittedAt: row.submitted_at,
  reportingRemarks: row.reporting_remarks,
  roRemarks: row.reporting_remarks,
  period: row.period,
  goalTitle: row.goal_title,
  weightage: row.weightage,
  goalStatus: row.goal_status
});

const upsertTracking = async (req, res, next) => {
  try {
    const { goalId, cycleId, period, progressText } = req.body;

    const goalRes = await pool.query(
      "SELECT goal_id, user_id, cycle_id, appraisal_id FROM goals WHERE goal_id = $1 LIMIT 1",
      [goalId]
    );
    const goal = goalRes.rows[0];
    if (!goal || goal.user_id !== req.user.id) {
      res.status(404);
      return next(new Error("Goal not found for this employee"));
    }

    const effectiveCycleId = cycleId || goal.cycle_id;
    const cycleRes = await pool.query("SELECT * FROM appraisal_cycles WHERE cycle_id = $1 LIMIT 1", [effectiveCycleId]);
    const cycle = cycleRes.rows[0] || null;
    if (!cycle) {
      res.status(400);
      return next(new Error("Appraisal cycle not found"));
    }
    if (req.user.role === ROLES.EMPLOYEE) {
      assertCycleWindowOpen({
        cycle,
        windowKey: "sixMonthOpen",
        message: "Six-month progress submission is not open for the current date."
      });
    }
    const existing = await pool.query(
      "SELECT review_id FROM six_month_review WHERE employee_id = $1 AND goal_id = $2 AND cycle_id = $3 LIMIT 1",
      [req.user.id, goalId, effectiveCycleId]
    );

    let reviewId;
    if (existing.rows.length) {
      reviewId = existing.rows[0].review_id;
      await pool.query(
        "UPDATE six_month_review SET progress_text = $1 WHERE review_id = $2",
        [progressText, reviewId]
      );
      await writeAudit({ user: req.user, action: "update", entity: "six_month_review", entityId: reviewId });
    } else {
      const inserted = await pool.query(
        `
        INSERT INTO six_month_review (employee_id, goal_id, cycle_id, appraisal_id, progress_text, status)
        VALUES ($1,$2,$3,$4,$5,'draft')
        RETURNING review_id
        `,
        [req.user.id, goalId, effectiveCycleId, goal.appraisal_id, progressText]
      );
      reviewId = inserted.rows[0].review_id;
      await writeAudit({ user: req.user, action: "create", entity: "six_month_review", entityId: reviewId });
    }

    const out = await pool.query("SELECT * FROM six_month_review WHERE review_id = $1", [reviewId]);
    return res.json(formatTrackingRecord(out.rows[0]));
  } catch (error) {
    return next(error);
  }
};

const submitTracking = async (req, res, next) => {
  try {
    const { cycleId } = req.body;

    // Get active cycle if not specified
    let effectiveCycleId = cycleId;
    if (!effectiveCycleId) {
      const activeCycle = await pool.query(
        "SELECT cycle_id FROM appraisal_cycles WHERE status = 'active' ORDER BY activated_at DESC NULLS LAST, created_at DESC LIMIT 1"
      );
      effectiveCycleId = activeCycle.rows[0]?.cycle_id;
    }

    if (!effectiveCycleId) {
      res.status(400);
      return next(new Error("No active cycle found"));
    }

    // Check if six-month window is open
    const cycleRes = await pool.query("SELECT * FROM appraisal_cycles WHERE cycle_id = $1 LIMIT 1", [effectiveCycleId]);
    const cycle = cycleRes.rows[0];
    if (!cycle) {
      res.status(400);
      return next(new Error("Appraisal cycle not found"));
    }
    if (req.user.role === ROLES.EMPLOYEE) {
      assertCycleWindowOpen({
        cycle,
        windowKey: "sixMonthOpen",
        message: "Six-month progress submission is not open for the current date."
      });
    }

    // Update all draft records to submitted for this employee and cycle
    await pool.query(
      "UPDATE six_month_review SET status = 'submitted', submitted_at = NOW() WHERE employee_id = $1 AND cycle_id = $2 AND status = 'draft'",
      [req.user.id, effectiveCycleId]
    );

    // Get submitted records count
    const submittedRes = await pool.query(
      "SELECT COUNT(*) as count FROM six_month_review WHERE employee_id = $1 AND cycle_id = $2 AND status = 'submitted'",
      [req.user.id, effectiveCycleId]
    );
    const submittedCount = submittedRes.rows[0].count;

    // Notify Reporting Officer
    const roRow = await pool.query(
      `
      SELECT reporting_officer_id
      FROM appraisal_cycle_participants
      WHERE cycle_id = $1 AND employee_id = $2
      LIMIT 1
      `,
      [effectiveCycleId, req.user.id]
    );
    const roId = roRow.rows[0]?.reporting_officer_id || null;
    if (roId) {
      await notifyUser({
        userId: roId,
        senderId: req.user.id,
        title: "Six-Month Progress Submitted",
        message: `Employee submitted self summary for ${submittedCount} goal(s). Please review and add remarks.`,
        type: "tracking_submission",
        entity: "six_month_review",
        entityId: null
      });
    }

    await writeAudit({ user: req.user, action: "submit", entity: "six_month_review", entityId: null });

    // Get all submitted records to return
    const { rows } = await pool.query(
      `
      SELECT
        r.*,
        g.goal_title,
        g.weightage,
        g.status AS goal_status
      FROM six_month_review r
      LEFT JOIN goals g ON g.goal_id = r.goal_id
      WHERE r.employee_id = $1 AND r.cycle_id = $2 AND r.status = 'submitted'
      ORDER BY r.submitted_at DESC
      `,
      [req.user.id, effectiveCycleId]
    );

    const formatted = rows.map(formatTrackingRecord);
    return res.json({ submitted: submittedCount, records: formatted });
  } catch (error) {
    return next(error);
  }
};

const addRoRemarks = async (req, res, next) => {
  try {
    const { trackingId, reportingRemarks } = req.body;
    const remarkText = String(reportingRemarks || "").trim();

    const trackingRes = await pool.query(
      "SELECT review_id, employee_id, cycle_id, appraisal_id FROM six_month_review WHERE review_id = $1 LIMIT 1",
      [trackingId]
    );
    const tracking = trackingRes.rows[0];
    if (!tracking) {
      res.status(404);
      return next(new Error("Tracking record not found"));
    }

    const roRow = await pool.query(
      `
      SELECT reporting_officer_id
      FROM appraisal_cycle_participants
      WHERE cycle_id = $1 AND employee_id = $2
      LIMIT 1
      `,
      [tracking.cycle_id, tracking.employee_id]
    );
    const roId = roRow.rows[0]?.reporting_officer_id || null;
    if (req.user.role !== ROLES.REPORTING_OFFICER || !roId || roId !== req.user.id) {
      res.status(403);
      return next(new Error("Access denied for this tracking record"));
    }

    await pool.query("UPDATE six_month_review SET reporting_remarks = $1 WHERE review_id = $2", [remarkText, trackingId]);

    await writeAudit({ user: req.user, action: "remark", entity: "six_month_review", entityId: trackingId });
    await notifyUser({
      userId: tracking.employee_id,
      senderId: req.user.id,
      title: "Tracking Remark Added",
      message: "Reporting Officer has added remarks to your six-month tracking.",
      type: "tracking_review",
      entity: "six_month_review",
      entityId: trackingId
    });

    const out = await pool.query("SELECT * FROM six_month_review WHERE review_id = $1", [trackingId]);
    return res.json(formatTrackingRecord(out.rows[0]));
  } catch (error) {
    return next(error);
  }
};

const listMyTracking = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        r.*,
        g.goal_title,
        g.weightage,
        g.status AS goal_status
      FROM six_month_review r
      LEFT JOIN goals g ON g.goal_id = r.goal_id
      WHERE r.employee_id = $1
      ORDER BY r.submitted_at DESC
      `,
      [req.user.id]
    );
    const formatted = rows.map(formatTrackingRecord);
    return res.json(formatted);
  } catch (error) {
    return next(error);
  }
};

const listTeamTracking = async (req, res, next) => {
  try {
    // Team is determined by appraisal_cycle_participants for active cycle
    const activeCycle = await pool.query(
      "SELECT cycle_id FROM appraisal_cycles WHERE status = 'active' ORDER BY activated_at DESC NULLS LAST, created_at DESC LIMIT 1"
    );
    const cycleId = activeCycle.rows[0]?.cycle_id || null;

    const { rows } = await pool.query(
      `
      SELECT
        r.*,
        u.user_id AS employee_id,
        u.first_name,
        u.last_name,
        u.email,
        d.name AS department,
        g.goal_title,
        g.weightage,
        g.status AS goal_status
      FROM six_month_review r
      JOIN appraisal_cycle_participants p ON p.cycle_id = r.cycle_id AND p.employee_id = r.employee_id
      JOIN users u ON u.user_id = r.employee_id
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN goals g ON g.goal_id = r.goal_id
      WHERE ($1::uuid IS NULL OR r.cycle_id = $1) AND p.reporting_officer_id = $2
      ORDER BY r.submitted_at DESC
      `,
      [cycleId, req.user.id]
    );

    const out = rows.map((row) => ({
      ...formatTrackingRecord(row),
      employee: {
        id: row.user_id,
        name: `${row.first_name || ""} ${row.last_name || ""}`.trim() || row.email,
        department: row.department
      }
    }));
    return res.json(out);
  } catch (error) {
    return next(error);
  }
};

export { upsertTracking, submitTracking, addRoRemarks, listMyTracking, listTeamTracking };
