import { writeAudit } from "../services/auditService.js";
import { notifyUser } from "../services/notificationService.js";
import pool from "../config/db.js";
import { ROLES } from "../constants/rbac.js";

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
    const existing = await pool.query(
      "SELECT review_id FROM six_month_review WHERE employee_id = $1 AND goal_id = $2 AND cycle_id = $3 LIMIT 1",
      [req.user.id, goalId, effectiveCycleId]
    );

    let reviewId;
    if (existing.rows.length) {
      reviewId = existing.rows[0].review_id;
      await pool.query(
        "UPDATE six_month_review SET progress_text = $1, submitted_at = NOW() WHERE review_id = $2",
        [progressText, reviewId]
      );
      await writeAudit({ user: req.user, action: "update", entity: "six_month_review", entityId: reviewId });
    } else {
      const inserted = await pool.query(
        `
        INSERT INTO six_month_review (employee_id, goal_id, cycle_id, appraisal_id, progress_text, submitted_at)
        VALUES ($1,$2,$3,$4,$5,NOW())
        RETURNING review_id
        `,
        [req.user.id, goalId, effectiveCycleId, goal.appraisal_id, progressText]
      );
      reviewId = inserted.rows[0].review_id;
      await writeAudit({ user: req.user, action: "submit", entity: "six_month_review", entityId: reviewId });
    }

    // Notify Reporting Officer based on participants mapping (active cycle)
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
        title: "Six-Month Review Submitted",
        message: `Employee submitted ${period} tracking for goal review.`,
        type: "tracking_submission",
        entity: "six_month_review",
        entityId: reviewId
      });
    }

    const out = await pool.query("SELECT * FROM six_month_review WHERE review_id = $1", [reviewId]);
    return res.json(out.rows[0]);
  } catch (error) {
    return next(error);
  }
};

const addRoRemarks = async (req, res, next) => {
  try {
    const { trackingId, reportingRemarks } = req.body;

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

    await pool.query("UPDATE six_month_review SET reporting_remarks = $1 WHERE review_id = $2", [reportingRemarks, trackingId]);

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
    return res.json(out.rows[0]);
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
    return res.json(rows);
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
        d.name AS department
      FROM six_month_review r
      JOIN appraisal_cycle_participants p ON p.cycle_id = r.cycle_id AND p.employee_id = r.employee_id
      JOIN users u ON u.user_id = r.employee_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE ($1::uuid IS NULL OR r.cycle_id = $1) AND p.reporting_officer_id = $2
      ORDER BY r.submitted_at DESC
      `,
      [cycleId, req.user.id]
    );

    const out = rows.map((row) => ({
      ...row,
      employee: {
        id: row.employee_id,
        name: `${row.first_name || ""} ${row.last_name || ""}`.trim() || row.email,
        department: row.department
      }
    }));
    return res.json(out);
  } catch (error) {
    return next(error);
  }
};

export { upsertTracking, addRoRemarks, listMyTracking, listTeamTracking };
