import crypto from "crypto";
import pool from "../config/db.js";
import { writeAudit } from "../services/auditService.js";
import { notifyUser } from "../services/notificationService.js";
import { ROLES, roleMatches } from "../constants/rbac.js";
import { computeScore } from "../services/scoreEngine.js";

let schemaEnsured = false;

const ensureReviewSchema = async () => {
  if (schemaEnsured) return;
  // We keep these tables separate from `goals` / `appraisals` to avoid
  // accidental coupling with the goal-setting schema.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appraisal_self_appraisals (
      id uuid PRIMARY KEY,
      appraisal_id uuid UNIQUE NOT NULL,
      employee_id uuid NOT NULL,
      cycle_id uuid NOT NULL,
      self_summary text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'submitted',
      submitted_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS appraisal_goal_ratings (
      id uuid PRIMARY KEY,
      appraisal_id uuid NOT NULL,
      goal_id uuid NOT NULL,
      achievement_text text NULL,
      self_rating int NULL,
      ro_rating int NULL,
      revo_rating int NULL,
      ao_rating int NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_appraisal_goal UNIQUE (appraisal_id, goal_id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_appraisal_goal_ratings_appraisal ON appraisal_goal_ratings (appraisal_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quantitative_attributes_master (
      id uuid PRIMARY KEY,
      category text NOT NULL,
      attribute_name text NOT NULL,
      description text NULL,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quantitative_attribute_ratings (
      id uuid PRIMARY KEY,
      appraisal_id uuid NOT NULL,
      attribute_id uuid NOT NULL,
      rated_by uuid NOT NULL,
      rated_by_role text NOT NULL,
      rating int NOT NULL,
      remarks text NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_attr_rating UNIQUE (appraisal_id, attribute_id, rated_by_role)
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_quant_attr_ratings_appraisal ON quantitative_attribute_ratings (appraisal_id);`
  );

  schemaEnsured = true;
};

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
  const r = await pool.query("SELECT * FROM appraisal_cycles WHERE closed_at IS NULL ORDER BY created_at DESC LIMIT 1");
  return r.rows[0] || null;
};

const ensureAppraisal = async (employeeId, cycleId) => {
  const existing = await pool.query(
    "SELECT id, employee_id, cycle_id, ro_id, revo_id, ao_id, status, self_appraisal_id, ro_score, revo_score, ao_score, final_score FROM appraisals WHERE employee_id = $1 AND cycle_id = $2 LIMIT 1",
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
  const inserted = await pool.query(
    `
    INSERT INTO appraisals (employee_id, cycle_id, ro_id, revo_id, ao_id, status)
    VALUES ($1,$2,$3,$4,$5,'draft')
    RETURNING id, employee_id, cycle_id, ro_id, revo_id, ao_id, status, self_appraisal_id, ro_score, revo_score, ao_score, final_score
    `,
    [
      employeeId,
      cycleId,
      row.reporting_officer_id || null,
      row.reviewing_officer_id || null,
      row.accepting_officer_id || null
    ]
  );
  return inserted.rows[0];
};

const upsertAttributeRatings = async ({ appraisalId, userId, role, ratings = [], client = pool }) => {
  for (const item of ratings) {
    const id = crypto.randomUUID();
    await client.query(
      `
      INSERT INTO quantitative_attribute_ratings
        (id, appraisal_id, attribute_id, rated_by, rated_by_role, rating, remarks, created_at, updated_at)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
      ON CONFLICT (appraisal_id, attribute_id, rated_by_role)
      DO UPDATE SET rating = EXCLUDED.rating, remarks = EXCLUDED.remarks, rated_by = EXCLUDED.rated_by, updated_at = NOW()
      `,
      [id, appraisalId, item.attributeId, userId, role, Number(item.rating), item.remarks || null]
    );
  }
};

const ensureGoalRatings = async ({ appraisalId, goals = [], providedRatings = [], client = pool }) => {
  const byGoal = new Map((providedRatings || []).map((r) => [r.goalId || r.goal_id || r.id, r]));
  for (const goal of goals) {
    const goalId = goal.goal_id || goal.id;
    const item = byGoal.get(goalId);
    const id = crypto.randomUUID();
    await client.query(
      `
      INSERT INTO appraisal_goal_ratings
        (id, appraisal_id, goal_id, achievement_text, self_rating, updated_at)
      VALUES
        ($1,$2,$3,$4,$5,NOW())
      ON CONFLICT (appraisal_id, goal_id)
      DO UPDATE SET achievement_text = EXCLUDED.achievement_text, self_rating = EXCLUDED.self_rating, updated_at = NOW()
      `,
      [id, appraisalId, goalId, item?.achievementText || item?.achievement_text || "", Number(item?.selfRating ?? item?.self_rating ?? 3)]
    );
  }
};

const submitSelfSummary = async (req, res, next) => {
  try {
    const { cycleId, year, selfSummary, goalRatings, reviewId } = req.body;
    await ensureReviewSchema();

    const cycle = await getActiveOrByYearCycle(cycleId, year);
    if (!cycle) return res.status(400).json({ error: "Appraisal cycle not found" });

    const appraisal = await ensureAppraisal(req.user.id, cycle.cycle_id);
    const targetAppraisalId = reviewId || appraisal.id;

    const appRes = await pool.query("SELECT * FROM appraisals WHERE id = $1 LIMIT 1", [targetAppraisalId]);
    const dbAppraisal = appRes.rows[0];
    if (!dbAppraisal) return res.status(404).json({ error: "Appraisal not found" });
    if (dbAppraisal.employee_id !== req.user.userId) return res.status(403).json({ error: "This appraisal is not assigned to you" });
    if (dbAppraisal.status !== "ro_approved") {
      return res.status(409).json({
        error: "Action not allowed in current appraisal state",
        required: "ro_approved",
        current: dbAppraisal.status
      });
    }

    const goalsRes = await pool.query(
      "SELECT goal_id, status FROM goals WHERE appraisal_id = $1 AND status IN ('approved','submitted') ORDER BY created_at ASC",
      [dbAppraisal.id]
    );
    if (!goalsRes.rows.length) {
      return res.status(400).json({ error: "Please submit goals before self-appraisal" });
    }

    const selfAppraisalId = dbAppraisal.self_appraisal_id || crypto.randomUUID();
    await pool.query(
      `
      INSERT INTO appraisal_self_appraisals (id, appraisal_id, employee_id, cycle_id, self_summary, status, submitted_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,'submitted',NOW(),NOW())
      ON CONFLICT (appraisal_id)
      DO UPDATE SET self_summary = EXCLUDED.self_summary, status = 'submitted', submitted_at = NOW(), updated_at = NOW()
      `,
      [selfAppraisalId, dbAppraisal.id, dbAppraisal.employee_id, dbAppraisal.cycle_id, String(selfSummary || "")]
    );

    await ensureGoalRatings({ appraisalId: dbAppraisal.id, goals: goalsRes.rows, providedRatings: goalRatings || [] });

    await pool.query(
      "UPDATE appraisals SET self_appraisal_id = $1, status = 'self_appraisal_done', self_appraisal_submitted_at = NOW() WHERE id = $2",
      [selfAppraisalId, dbAppraisal.id]
    );

    const employee = await pool.query(
      "SELECT first_name, last_name, email FROM users WHERE user_id = $1 LIMIT 1",
      [dbAppraisal.employee_id]
    );
    const empName =
      `${employee.rows[0]?.first_name || ""} ${employee.rows[0]?.last_name || ""}`.trim() || employee.rows[0]?.email || "Employee";
    if (dbAppraisal.ro_id) {
      await notifyUser({
        userId: dbAppraisal.ro_id,
        senderId: dbAppraisal.employee_id,
        title: "Self-Appraisal Pending",
        message: `${empName} submitted self-appraisal for ${cycle.cycle_name}`,
        type: "self_appraisal_submission",
        entity: "appraisal",
        entityId: dbAppraisal.id
      });
    }

    await writeAudit({ user: req.user, action: "submit", entity: "self_appraisal", entityId: selfAppraisalId });
    const out = await pool.query("SELECT * FROM appraisals WHERE id = $1", [dbAppraisal.id]);
    return res.json({ selfAppraisal: { id: selfAppraisalId, appraisalId: dbAppraisal.id }, review: out.rows[0] });
  } catch (error) {
    return next(error);
  }
};

const rateByRO = async (req, res, next) => {
  try {
    const { reviewId, score, remarks, attributeRatings = [] } = req.body;
    await ensureReviewSchema();
    const appRes = await pool.query("SELECT * FROM appraisals WHERE id = $1 LIMIT 1", [reviewId]);
    const appraisal = appRes.rows[0];
    if (!appraisal) return res.status(404).json({ error: "Review not found" });
    if (appraisal.status !== "self_appraisal_done") {
      return res.status(409).json({
        error: "Action not allowed in current appraisal state",
        required: "self_appraisal_done",
        current: appraisal.status
      });
    }
    if (appraisal.ro_id !== req.user.userId) return res.status(403).json({ error: "This appraisal is not assigned to you" });

    await pool.query("UPDATE appraisal_goal_ratings SET ro_rating = $1, updated_at = NOW() WHERE appraisal_id = $2", [
      Number(score || 0),
      appraisal.id
    ]);
    await upsertAttributeRatings({
      appraisalId: appraisal.id,
      userId: req.user.userId,
      role: ROLES.REPORTING_OFFICER,
      ratings: attributeRatings
    });

    await pool.query(
      "UPDATE appraisals SET ro_remarks = $1, ro_reviewed_at = NOW(), status = 'ro_rated' WHERE id = $2",
      [remarks || null, appraisal.id]
    );

    await computeScore(appraisal.id, { actorId: req.user.userId });

    const roRow = await pool.query("SELECT rew_id FROM users WHERE user_id = $1 LIMIT 1", [req.user.userId]);
    const revoId = roRow.rows[0]?.rew_id || appraisal.revo_id || null;
    if (revoId) {
      const employee = await pool.query(
        "SELECT first_name, last_name, email FROM users WHERE user_id = $1 LIMIT 1",
        [appraisal.employee_id]
      );
      const name =
        `${employee.rows[0]?.first_name || ""} ${employee.rows[0]?.last_name || ""}`.trim() || employee.rows[0]?.email;
      await notifyUser({
        userId: revoId,
        senderId: req.user.userId,
        title: "Review Pending at Reviewing Officer",
        message: `${name} appraisal is pending your review.`,
        type: "review_pending",
        entity: "appraisal",
        entityId: appraisal.id
      });
    }

    await writeAudit({ user: req.user, action: "approve", entity: "appraisal", entityId: appraisal.id });
    const out = await pool.query("SELECT * FROM appraisals WHERE id = $1", [appraisal.id]);
    return res.json(out.rows[0]);
  } catch (error) {
    return next(error);
  }
};

const reviewByReviewing = async (req, res, next) => {
  try {
    const { reviewId, score, remarks, attributeRatings = [] } = req.body;
    await ensureReviewSchema();
    const appRes = await pool.query("SELECT * FROM appraisals WHERE id = $1 LIMIT 1", [reviewId]);
    const appraisal = appRes.rows[0];
    if (!appraisal) return res.status(404).json({ error: "Review not found" });
    if (appraisal.status !== "ro_rated") {
      return res.status(409).json({
        error: "Action not allowed in current appraisal state",
        required: "ro_rated",
        current: appraisal.status
      });
    }
    if (appraisal.revo_id !== req.user.userId) return res.status(403).json({ error: "This appraisal is not assigned to you" });

    // RevO sets its own rating (does not expose RO values while editing; handled in getRevoForm)
    await pool.query(
      "UPDATE appraisal_goal_ratings SET revo_rating = $1, updated_at = NOW() WHERE appraisal_id = $2",
      [Number(score || 0), appraisal.id]
    );
    await upsertAttributeRatings({
      appraisalId: appraisal.id,
      userId: req.user.userId,
      role: ROLES.REVIEWING_OFFICER,
      ratings: attributeRatings
    });

    await pool.query(
      "UPDATE appraisals SET revo_remarks = $1, revo_reviewed_at = NOW(), status = 'revo_rated' WHERE id = $2",
      [remarks || null, appraisal.id]
    );

    await computeScore(appraisal.id, { actorId: req.user.userId });

    const employee = await pool.query("SELECT first_name, last_name, email FROM users WHERE user_id = $1 LIMIT 1", [
      appraisal.employee_id
    ]);
    const name =
      `${employee.rows[0]?.first_name || ""} ${employee.rows[0]?.last_name || ""}`.trim() || employee.rows[0]?.email;

    // Notify all AOs: appraisals is bound to ao_id, but we also support AO users who have assignees (legacy behavior).
    const aos = await pool.query("SELECT user_id FROM users WHERE is_active = true AND role IN ($1,$2)", [
      ROLES.ACCEPTING_OFFICER,
      "AcceptingOfficer"
    ]);
    for (const ao of aos.rows) {
      await notifyUser({
        userId: ao.user_id,
        senderId: req.user.userId,
        title: "Final Approval Required",
        message: `${name} appraisal is pending final approval.`,
        type: "review_pending",
        entity: "appraisal",
        entityId: appraisal.id
      });
    }

    await writeAudit({ user: req.user, action: "approve", entity: "appraisal", entityId: appraisal.id });
    const out = await pool.query("SELECT * FROM appraisals WHERE id = $1", [appraisal.id]);
    return res.json(out.rows[0]);
  } catch (error) {
    return next(error);
  }
};

const acceptByAccepting = async (req, res, next) => {
  try {
    const { reviewId, score, remarks, attributeRatings = [] } = req.body;
    await ensureReviewSchema();
    const appRes = await pool.query("SELECT * FROM appraisals WHERE id = $1 LIMIT 1", [reviewId]);
    const appraisal = appRes.rows[0];
    if (!appraisal) return res.status(404).json({ error: "Review not found" });
    if (appraisal.status !== "revo_rated") {
      return res.status(409).json({
        error: "Action not allowed in current appraisal state",
        required: "revo_rated",
        current: appraisal.status
      });
    }
    if (appraisal.ao_id !== req.user.userId) return res.status(403).json({ error: "This appraisal is not assigned to you" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        "UPDATE appraisal_goal_ratings SET ao_rating = $1, updated_at = NOW() WHERE appraisal_id = $2",
        [Number(score || 0), appraisal.id]
      );
      await upsertAttributeRatings({
        appraisalId: appraisal.id,
        userId: req.user.userId,
        role: ROLES.ACCEPTING_OFFICER,
        ratings: attributeRatings,
        client
      });

      await client.query(
        "UPDATE appraisals SET ao_remarks = $1, ao_reviewed_at = NOW(), status = 'ao_accepted' WHERE id = $2",
        [remarks || null, appraisal.id]
      );

      const { finalScore } = await computeScore(appraisal.id, { actorId: req.user.userId, transaction: client });

      await client.query("UPDATE appraisals SET status = 'completed', completed_at = NOW() WHERE id = $1", [appraisal.id]);
      await client.query("UPDATE appraisal_self_appraisals SET status = 'ao_finalized', updated_at = NOW() WHERE appraisal_id = $1", [
        appraisal.id
      ]);

      await notifyUser({
        userId: appraisal.employee_id,
        senderId: req.user.userId,
        title: "Appraisal Finalized",
        message: `Your appraisal has been finalized with score ${Number(finalScore || 0).toFixed(2)}.`,
        type: "review_finalized",
        entity: "appraisal",
        entityId: appraisal.id
      });
      await writeAudit({
        user: req.user,
        action: "appraisal_completed",
        entity: "appraisal",
        entityId: appraisal.id,
        details: { finalScore }
      });

      await client.query("COMMIT");
      const out = await pool.query("SELECT * FROM appraisals WHERE id = $1", [appraisal.id]);
      return res.json(out.rows[0]);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    return next(error);
  }
};

const listMyReviews = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        a.*,
        c.cycle_name,
        c.cycle_year
      FROM appraisals a
      LEFT JOIN appraisal_cycles c ON c.cycle_id = a.cycle_id
      WHERE a.employee_id = $1
      ORDER BY a.created_at DESC
      `,
      [req.user.userId]
    );
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
};

const listQueue = async (req, res, next) => {
  try {
    const role = req.user.role;
    if (roleMatches(role, ROLES.HR_ADMIN)) {
      const { rows } = await pool.query(
        `
        SELECT
          a.*,
          u.user_id AS employee_id,
          u.first_name,
          u.last_name,
          u.email,
          d.name AS department,
          c.cycle_name,
          c.cycle_year
        FROM appraisals a
        JOIN users u ON u.user_id = a.employee_id
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN appraisal_cycles c ON c.cycle_id = a.cycle_id
        ORDER BY a.created_at DESC
        `
      );
      return res.json(
        rows.map((r) => ({
          ...r,
          employee: {
            id: r.employee_id,
            name: `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.email,
            department: r.department
          }
        }))
      );
    }

    if (roleMatches(role, ROLES.REPORTING_OFFICER)) {
      const { rows } = await pool.query(
        `
        SELECT
          a.*,
          u.user_id AS employee_id,
          u.first_name,
          u.last_name,
          u.email,
          d.name AS department,
          c.cycle_name,
          c.cycle_year
        FROM appraisals a
        JOIN users u ON u.user_id = a.employee_id
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN appraisal_cycles c ON c.cycle_id = a.cycle_id
        WHERE a.ro_id = $1 AND a.status = 'self_appraisal_done'
        ORDER BY a.created_at DESC
        `,
        [req.user.userId]
      );
      return res.json(
        rows.map((r) => ({
          ...r,
          employee: {
            id: r.employee_id,
            name: `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.email,
            department: r.department
          }
        }))
      );
    }

    if (roleMatches(role, ROLES.REVIEWING_OFFICER)) {
      const { rows } = await pool.query(
        `
        SELECT
          a.*,
          u.user_id AS employee_id,
          u.first_name,
          u.last_name,
          u.email,
          d.name AS department,
          c.cycle_name,
          c.cycle_year
        FROM appraisals a
        JOIN users u ON u.user_id = a.employee_id
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN appraisal_cycles c ON c.cycle_id = a.cycle_id
        WHERE a.revo_id = $1 AND a.status = 'ro_rated'
        ORDER BY a.created_at DESC
        `,
        [req.user.userId]
      );
      return res.json(
        rows.map((r) => ({
          ...r,
          employee: {
            id: r.employee_id,
            name: `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.email,
            department: r.department
          }
        }))
      );
    }

    if (roleMatches(role, ROLES.ACCEPTING_OFFICER)) {
      const { rows } = await pool.query(
        `
        SELECT
          a.*,
          u.user_id AS employee_id,
          u.first_name,
          u.last_name,
          u.email,
          d.name AS department,
          c.cycle_name,
          c.cycle_year
        FROM appraisals a
        JOIN users u ON u.user_id = a.employee_id
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN appraisal_cycles c ON c.cycle_id = a.cycle_id
        WHERE a.ao_id = $1 AND a.status = 'revo_rated'
        ORDER BY a.created_at DESC
        `,
        [req.user.userId]
      );
      return res.json(
        rows.map((r) => ({
          ...r,
          employee: {
            id: r.employee_id,
            name: `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.email,
            department: r.department
          }
        }))
      );
    }

    return res.json([]);
  } catch (error) {
    return next(error);
  }
};

const listAttributeMasters = async (req, res, next) => {
  try {
    await ensureReviewSchema();
    const { rows } = await pool.query(
      "SELECT id, category, attribute_name, description FROM quantitative_attributes_master WHERE is_active = true ORDER BY category ASC, attribute_name ASC"
    );
    const out = rows.map((r) => ({
      id: r.id,
      category: r.category,
      attributeName: r.attribute_name,
      description: r.description
    }));
    return res.json(out);
  } catch (error) {
    return next(error);
  }
};

const getRevoForm = async (req, res, next) => {
  try {
    const { appraisalId } = req.params;
    await ensureReviewSchema();
    const appRes = await pool.query(
      `
      SELECT
        a.*,
        u.user_id AS employee_id,
        u.first_name,
        u.last_name,
        u.email,
        d.name AS department
      FROM appraisals a
      JOIN users u ON u.user_id = a.employee_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE a.id = $1
      LIMIT 1
      `,
      [appraisalId]
    );
    const review = appRes.rows[0];
    if (!review) return res.status(404).json({ error: "Review not found" });
    if (review.status !== "ro_rated") {
      return res.status(409).json({ error: "Action not allowed in current appraisal state", required: "ro_rated", current: review.status });
    }
    if (review.revo_id !== req.user.userId) return res.status(403).json({ error: "This appraisal is not assigned to you" });

    // RevO blind while editing: hide RO ratings until RevO submission.
    const goalRatingsRes = await pool.query(
      `
      SELECT goal_id, achievement_text, self_rating, NULL::int AS ro_rating, revo_rating, ao_rating
      FROM appraisal_goal_ratings
      WHERE appraisal_id = $1
      ORDER BY created_at ASC
      `,
      [review.id]
    );
    const attributeRatingsRes = await pool.query(
      `
      SELECT attribute_id, rated_by_role, rating, remarks, created_at
      FROM quantitative_attribute_ratings
      WHERE appraisal_id = $1 AND rated_by_role <> $2
      ORDER BY created_at ASC
      `,
      [review.id, ROLES.REPORTING_OFFICER]
    );
    return res.json({
      review: {
        ...review,
        employee: {
          id: review.employee_id,
          name: `${review.first_name || ""} ${review.last_name || ""}`.trim() || review.email,
          department: review.department
        }
      },
      goalRatings: goalRatingsRes.rows,
      attributeRatings: attributeRatingsRes.rows
    });
  } catch (error) {
    return next(error);
  }
};

const getAoForm = async (req, res, next) => {
  try {
    const { appraisalId } = req.params;
    await ensureReviewSchema();
    const appRes = await pool.query(
      `
      SELECT
        a.*,
        u.user_id AS employee_id,
        u.first_name,
        u.last_name,
        u.email,
        d.name AS department
      FROM appraisals a
      JOIN users u ON u.user_id = a.employee_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE a.id = $1
      LIMIT 1
      `,
      [appraisalId]
    );
    const review = appRes.rows[0];
    if (!review) return res.status(404).json({ error: "Review not found" });
    if (review.status !== "revo_rated") {
      return res.status(409).json({
        error: "Action not allowed in current appraisal state",
        required: "revo_rated",
        current: review.status
      });
    }
    if (review.ao_id !== req.user.userId) return res.status(403).json({ error: "This appraisal is not assigned to you" });

    const goalRatingsRes = await pool.query(
      "SELECT goal_id, achievement_text, self_rating, ro_rating, revo_rating, ao_rating FROM appraisal_goal_ratings WHERE appraisal_id = $1 ORDER BY created_at ASC",
      [review.id]
    );
    const attributeRatingsRes = await pool.query(
      "SELECT attribute_id, rated_by_role, rating, remarks, created_at FROM quantitative_attribute_ratings WHERE appraisal_id = $1 ORDER BY created_at ASC",
      [review.id]
    );
    return res.json({
      review: {
        ...review,
        employee: {
          id: review.employee_id,
          name: `${review.first_name || ""} ${review.last_name || ""}`.trim() || review.email,
          department: review.department
        }
      },
      goalRatings: goalRatingsRes.rows,
      attributeRatings: attributeRatingsRes.rows
    });
  } catch (error) {
    return next(error);
  }
};

export {
  submitSelfSummary,
  rateByRO,
  reviewByReviewing,
  acceptByAccepting,
  listMyReviews,
  listQueue,
  listAttributeMasters,
  getRevoForm,
  getAoForm
};
