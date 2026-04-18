import crypto from "crypto";
import pool from "../config/db.js";
import { writeAudit } from "../services/auditService.js";
import { notifyUser } from "../services/notificationService.js";
import { ROLES, roleMatches } from "../constants/rbac.js";
import { computeScore } from "../services/scoreEngine.js";
import { ensureIsROForAppraisal, ensureIsRevOForAppraisal, ensureIsAOForAppraisal } from "../services/relationshipGuards.js";
import { assertCycleWindowOpen } from "../services/cycleAccess.js";

let schemaEnsured = false;
let appraisalColumnsCache = null;

const getAppraisalColumns = async () => {
  if (appraisalColumnsCache) return appraisalColumnsCache;
  const { rows } = await pool.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appraisals'
    `
  );
  appraisalColumnsCache = new Set(rows.map((r) => r.column_name));
  return appraisalColumnsCache;
};

const resolveExistingColumn = (columnSet, candidates = []) => {
  for (const candidate of candidates) {
    if (columnSet.has(candidate)) return candidate;
  }
  return null;
};

const updateAppraisalStage = async ({ appraisalId, nextStatus, reviewedAtCandidates = [], remarksField = null, remarksValue = null }) => {
  const cols = await getAppraisalColumns();
  const sets = ["status = $1"];
  const values = [nextStatus];
  let paramIndex = 2;

  const reviewedAtField = resolveExistingColumn(cols, reviewedAtCandidates);
  if (reviewedAtField) {
    sets.push(`${reviewedAtField} = NOW()`);
  }

  if (remarksField && cols.has(remarksField)) {
    sets.push(`${remarksField} = $${paramIndex}`);
    values.push(remarksValue ?? null);
    paramIndex += 1;
  }

  values.push(appraisalId);
  const appraisalIdParam = paramIndex;

  await pool.query(`UPDATE appraisals SET ${sets.join(", ")} WHERE id = $${appraisalIdParam}`, values);
};

const ensureReviewSchema = async () => {
  if (schemaEnsured) return;
  // Validate schema only. Do NOT create new tables here.
  const requiredTables = [
    "appraisal_ratings",
    "quantitative_attributes_master",
    "quantitative_attribute_ratings"
  ];
  for (const tableName of requiredTables) {
    const tableCheck = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS ok",
      [tableName]
    );
    if (!tableCheck.rows[0]?.ok) {
      throw new Error(`Required table missing: ${tableName}. Backend will not auto-create tables.`);
    }
  }

  const selfTables = [
    "annual_self_appraisal",
    "annual_self_appraisals",
    "appraisal_self_appraisal",
    "appraisal_self_appraisals"
  ];
  const selfTableCheck = await pool.query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    LIMIT 1
    `,
    [selfTables]
  );
  if (!selfTableCheck.rows.length) {
    throw new Error(
      "Required self-appraisal table missing. Expected one of: annual_self_appraisal, annual_self_appraisals, appraisal_self_appraisal, appraisal_self_appraisals."
    );
  }

  const goalRatingColumns = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'appraisal_ratings'"
  );
  const goalRatingColSet = new Set(goalRatingColumns.rows.map((r) => r.column_name));
  const requiredGoalRatingColumns = [
    "appraisal_id",
    "goal_id",
    "achievement_text",
    "self_rating",
    "ro_rating",
    "ro_remarks",
    "revo_rating",
    "revo_remarks",
    "ao_rating",
    "ao_remarks"
  ];
  const missingGoalRatingColumns = requiredGoalRatingColumns.filter((name) => !goalRatingColSet.has(name));
  if (missingGoalRatingColumns.length) {
    throw new Error(
      `Required columns missing in appraisal_ratings: ${missingGoalRatingColumns.join(", ")}. Backend will not auto-alter schema.`
    );
  }

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
    if (r.rows[0]) return r.rows[0];
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
  const inserted = await pool.query(
    `
    INSERT INTO appraisals (employee_id, cycle_id, ro_id, revo_id, ao_id, status)
    VALUES ($1,$2,$3,$4,$5,'draft')
    RETURNING id, employee_id, cycle_id, ro_id, revo_id, ao_id, status
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
      INSERT INTO appraisal_ratings
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

const getGoalReviewStage = (status) => {
  if (status === "self_appraisal_done") {
    return {
      role: ROLES.REPORTING_OFFICER,
      ratingField: "ro_rating",
      remarksField: "ro_remarks",
      nextStatus: "ro_rated",
      reviewedAtCandidates: ["ro_reviewed_at", "ro_rated_at"],
      notifyTitle: "Review Pending at Reviewing Officer",
      notifyMessage: (name) => `${name} appraisal is pending your review.`,
      notifyType: "review_pending"
    };
  }
  if (status === "ro_rated") {
    return {
      role: ROLES.REVIEWING_OFFICER,
      ratingField: "revo_rating",
      remarksField: "revo_remarks",
      nextStatus: "revo_rated",
      reviewedAtCandidates: ["revo_reviewed_at", "revo_rated_at"],
      notifyTitle: "Final Approval Required",
      notifyMessage: (name) => `${name} appraisal is pending final approval.`,
      notifyType: "review_pending"
    };
  }
  if (status === "revo_rated") {
    return {
      role: ROLES.ACCEPTING_OFFICER,
      ratingField: "ao_rating",
      remarksField: "ao_remarks",
      nextStatus: "ao_accepted",
      reviewedAtCandidates: ["ao_reviewed_at", "ao_accepted_at"],
      notifyTitle: "Appraisal Finalized",
      notifyMessage: (name, score) => `${name} appraisal has been finalized with score ${Number(score || 0).toFixed(2)}.`,
      notifyType: "review_finalized"
    };
  }
  return null;
};

const submitGoalStageRatings = async (req, res, next) => {
  try {
    const { appraisalId, goalRatings = [], summaryRemarks = "" } = req.body;
    await ensureReviewSchema();

    const appRes = await pool.query("SELECT * FROM appraisals WHERE id = $1 LIMIT 1", [appraisalId]);
    let appraisal = appRes.rows[0];
    if (!appraisal) return res.status(404).json({ error: "Appraisal not found" });
    appraisal = await reconcileAppraisalReadyForRO(appraisal);

    const stage = getGoalReviewStage(appraisal.status);
    if (!stage) {
      return res.status(409).json({ error: "Action not allowed in current appraisal state", current: appraisal.status });
    }

    const roleCheck =
      stage.role === ROLES.REPORTING_OFFICER
        ? await ensureIsROForAppraisal(appraisal.id, req.user.userId)
        : stage.role === ROLES.REVIEWING_OFFICER
          ? await ensureIsRevOForAppraisal(appraisal.id, req.user.userId)
          : await ensureIsAOForAppraisal(appraisal.id, req.user.userId);
    if (!roleCheck.ok) {
      return res.status(roleCheck.error === "Appraisal not found" ? 404 : 403).json({ error: roleCheck.error });
    }

    const goalRows = await pool.query(
      `
      SELECT g.goal_id
      FROM goals g
      WHERE g.user_id = $1 AND g.cycle_id = $2 AND g.status IN ('approved', 'submitted')
      ORDER BY g.created_at ASC
      `,
      [appraisal.employee_id, appraisal.cycle_id]
    );
    const expectedGoalIds = goalRows.rows.map((row) => String(row.goal_id));
    const ratingMap = new Map(
      (Array.isArray(goalRatings) ? goalRatings : []).map((item) => [String(item.goalId || item.goal_id || item.id), item])
    );

    const missingGoalIds = [];
    const normalizedRatings = [];
    for (const goalId of expectedGoalIds) {
      const item = ratingMap.get(goalId);
      const rating = Number(item?.rating ?? item?.score ?? 0);
      const remarks = String(item?.remarks ?? "").trim();
      if (!rating || rating < 1 || rating > 5 || !remarks) {
        missingGoalIds.push(goalId);
        continue;
      }
      normalizedRatings.push({ goalId, rating, remarks });
    }

    if (missingGoalIds.length > 0) {
      return res.status(400).json({
        error: "Each goal must have both a rating and remarks before submission",
        missingGoalIds
      });
    }

    for (const item of normalizedRatings) {
      const id = crypto.randomUUID();
      await pool.query(
        `
        INSERT INTO appraisal_ratings (id, appraisal_id, goal_id, ${stage.ratingField}, ${stage.remarksField}, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (appraisal_id, goal_id)
        DO UPDATE SET ${stage.ratingField} = EXCLUDED.${stage.ratingField}, ${stage.remarksField} = EXCLUDED.${stage.remarksField}, updated_at = NOW()
        `,
        [id, appraisalId, item.goalId, item.rating, item.remarks]
      );
    }

    const nextStatus = stage.nextStatus;
    await updateAppraisalStage({
      appraisalId,
      nextStatus,
      reviewedAtCandidates: stage.reviewedAtCandidates
    });

    const scoreResult = await computeScore(appraisalId, { actorId: req.user.userId });

    const employee = await pool.query("SELECT first_name, last_name, email FROM users WHERE user_id = $1 LIMIT 1", [appraisal.employee_id]);
    const employeeName = `${employee.rows[0]?.first_name || ""} ${employee.rows[0]?.last_name || ""}`.trim() || employee.rows[0]?.email || "Employee";

    if (stage.role === ROLES.REPORTING_OFFICER) {
      const revoId = appraisal.revo_id || (await pool.query("SELECT rew_id FROM users WHERE user_id = $1 LIMIT 1", [req.user.userId])).rows[0]?.rew_id || null;
      if (revoId) {
        await notifyUser({
          userId: revoId,
          senderId: req.user.userId,
          title: stage.notifyTitle,
          message: stage.notifyMessage(employeeName),
          type: stage.notifyType,
          entity: "appraisal",
          entityId: appraisal.id
        });
      }
    } else if (stage.role === ROLES.REVIEWING_OFFICER) {
      const aos = await pool.query("SELECT user_id FROM users WHERE is_active = true AND role IN ($1,$2)", [ROLES.ACCEPTING_OFFICER, "AcceptingOfficer"]);
      for (const ao of aos.rows) {
        await notifyUser({
          userId: ao.user_id,
          senderId: req.user.userId,
          title: stage.notifyTitle,
          message: stage.notifyMessage(employeeName),
          type: stage.notifyType,
          entity: "appraisal",
          entityId: appraisal.id
        });
      }
    } else {
      await notifyUser({
        userId: appraisal.employee_id,
        senderId: req.user.userId,
        title: stage.notifyTitle,
        message: stage.notifyMessage(employeeName, scoreResult.finalScore),
        type: stage.notifyType,
        entity: "appraisal",
        entityId: appraisal.id
      });
    }

    await writeAudit({ user: req.user, action: "submit", entity: `goal_${stage.ratingField}`, entityId: appraisalId, details: { summaryRemarks: String(summaryRemarks || "").trim() } });
    return res.json({ success: true, nextStatus, finalScore: scoreResult.finalScore });
  } catch (error) {
    return next(error);
  }
};

const resolveSelfAppraisalTable = async () => {
  const { rows } = await pool.query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'annual_self_appraisal',
        'annual_self_appraisals',
        'appraisal_self_appraisal',
        'appraisal_self_appraisals'
      )
    ORDER BY CASE
      WHEN table_name = 'annual_self_appraisal' THEN 0
      WHEN table_name = 'annual_self_appraisals' THEN 1
      WHEN table_name = 'appraisal_self_appraisal' THEN 2
      ELSE 3
    END
    LIMIT 1
    `
  );
  return rows[0]?.table_name || "annual_self_appraisal";
};

const quoteIdentifier = (name) => `"${String(name).replace(/"/g, '""')}"`;

const getTableColumns = async (tableName) => {
  const { rows } = await pool.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    `,
    [tableName]
  );
  return new Set(rows.map((r) => r.column_name));
};

const pickExistingColumn = (columnSet, candidates) => candidates.find((c) => columnSet.has(c)) || null;

const getSelfAppraisalRecordForAppraisal = async ({ appraisalId, employeeId, cycleId }) => {
  const candidates = [
    "annual_self_appraisal",
    "annual_self_appraisals",
    "appraisal_self_appraisal",
    "appraisal_self_appraisals"
  ];

  for (const tableName of candidates) {
    const tableExists = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS ok",
      [tableName]
    );
    if (!tableExists.rows[0]?.ok) continue;

    const cols = await getTableColumns(tableName);
    const idCol = pickExistingColumn(cols, ["id", "appraisal_id"]);
    const appraisalCol = pickExistingColumn(cols, ["appraisal_id", "appraisalId"]);
    const employeeCol = pickExistingColumn(cols, ["employee_id", "employeeId"]);
    const cycleCol = pickExistingColumn(cols, ["cycle_id", "cycleId"]);
    const summaryCol = pickExistingColumn(cols, ["self_appraisal_summary", "selfAppraisalSummary", "self_summary", "selfSummary"]);
    const submittedAtCol = pickExistingColumn(cols, ["submitted_at", "submittedAt"]);
    const updatedAtCol = pickExistingColumn(cols, ["updated_at", "updatedAt"]);
    const createdAtCol = pickExistingColumn(cols, ["created_at", "createdAt"]);

    if (!idCol || !summaryCol) continue;

    if (appraisalCol) {
      const orderCol = submittedAtCol || updatedAtCol || createdAtCol || idCol;
      const { rows } = await pool.query(
        `
        SELECT ${quoteIdentifier(idCol)} AS id, ${quoteIdentifier(summaryCol)} AS summary
        FROM ${quoteIdentifier(tableName)}
        WHERE ${quoteIdentifier(appraisalCol)} = $1
        ORDER BY ${quoteIdentifier(orderCol)} DESC
        LIMIT 1
        `,
        [appraisalId]
      );
      if (rows.length) {
        return { tableName, id: rows[0].id, summary: rows[0].summary || "" };
      }
    }

    if (employeeCol && cycleCol) {
      const orderCol = submittedAtCol || updatedAtCol || createdAtCol || idCol;
      const { rows } = await pool.query(
        `
        SELECT ${quoteIdentifier(idCol)} AS id, ${quoteIdentifier(summaryCol)} AS summary
        FROM ${quoteIdentifier(tableName)}
        WHERE ${quoteIdentifier(employeeCol)} = $1
          AND ${quoteIdentifier(cycleCol)} = $2
        ORDER BY ${quoteIdentifier(orderCol)} DESC
        LIMIT 1
        `,
        [employeeId, cycleId]
      );
      if (rows.length) {
        return { tableName, id: rows[0].id, summary: rows[0].summary || "" };
      }
    }
  }

  return { tableName: null, id: null, summary: "" };
};

const getLegacyAchievementMap = async ({ selfAppraisalId }) => {
  if (!selfAppraisalId) return new Map();

  const tableName = "self_appraisal_goal_ratings";
  const tableExists = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS ok",
    [tableName]
  );
  if (!tableExists.rows[0]?.ok) return new Map();

  const cols = await getTableColumns(tableName);
  const selfAppraisalCol = pickExistingColumn(cols, ["self_appraisal_id", "selfAppraisalId"]);
  const goalCol = pickExistingColumn(cols, ["goal_id", "goalId"]);
  const achievementCol = pickExistingColumn(cols, ["achievement_text", "achievementText"]);
  if (!selfAppraisalCol || !goalCol || !achievementCol) return new Map();

  const { rows } = await pool.query(
    `
    SELECT ${quoteIdentifier(goalCol)} AS goal_id, ${quoteIdentifier(achievementCol)} AS achievement_text
    FROM ${quoteIdentifier(tableName)}
    WHERE ${quoteIdentifier(selfAppraisalCol)} = $1
    `,
    [selfAppraisalId]
  );

  return new Map(rows.map((r) => [String(r.goal_id), String(r.achievement_text || "")]));
};

const getKpaAchievementMap = async ({ appraisalId }) => {
  if (!appraisalId) return new Map();

  const tableName = "self_appraisal_kpa_ratings";
  const tableExists = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS ok",
    [tableName]
  );
  if (!tableExists.rows[0]?.ok) return new Map();

  const cols = await getTableColumns(tableName);
  const appraisalCol = pickExistingColumn(cols, ["appraisal_id", "appraisalId"]);
  const goalCol = pickExistingColumn(cols, ["goal_id", "goalId"]);
  const achievementCol = pickExistingColumn(cols, ["actual_achievement_text", "achievement_text", "actualAchievementText", "achievementText"]);
  if (!appraisalCol || !goalCol || !achievementCol) return new Map();

  const { rows } = await pool.query(
    `
    SELECT ${quoteIdentifier(goalCol)} AS goal_id, ${quoteIdentifier(achievementCol)} AS achievement_text
    FROM ${quoteIdentifier(tableName)}
    WHERE ${quoteIdentifier(appraisalCol)} = $1
    `,
    [appraisalId]
  );

  return new Map(rows.map((r) => [String(r.goal_id), String(r.achievement_text || "")]));
};

const ensureAppraisalOfficerAssignments = async (appraisal) => {
  if (!appraisal) return appraisal;
  if (appraisal.ro_id && appraisal.revo_id && appraisal.ao_id) return appraisal;

  const participantRes = await pool.query(
    `
    SELECT reporting_officer_id, reviewing_officer_id, accepting_officer_id
    FROM appraisal_cycle_participants
    WHERE cycle_id = $1 AND employee_id = $2
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [appraisal.cycle_id, appraisal.employee_id]
  );
  const participant = participantRes.rows[0];
  if (!participant) return appraisal;

  const nextRo = appraisal.ro_id || participant.reporting_officer_id || null;
  const nextRevo = appraisal.revo_id || participant.reviewing_officer_id || null;
  const nextAo = appraisal.ao_id || participant.accepting_officer_id || null;

  if (nextRo === appraisal.ro_id && nextRevo === appraisal.revo_id && nextAo === appraisal.ao_id) {
    return appraisal;
  }

  const updated = await pool.query(
    "UPDATE appraisals SET ro_id = $1, revo_id = $2, ao_id = $3, updated_at = NOW() WHERE id = $4 RETURNING *",
    [nextRo, nextRevo, nextAo, appraisal.id]
  );
  return updated.rows[0] || appraisal;
};

const hasAllFinalAchievements = async (appraisalId, employeeId, cycleId) => {
  const goalsRes = await pool.query(
    `
    SELECT g.goal_id
    FROM goals g
    WHERE g.user_id = $1 AND g.cycle_id = $2 AND g.status IN ('approved', 'submitted')
    `,
    [employeeId, cycleId]
  );
  const goals = goalsRes.rows;
  if (!goals.length) return false;

  const ratingsRes = await pool.query(
    "SELECT goal_id, achievement_text FROM appraisal_ratings WHERE appraisal_id = $1",
    [appraisalId]
  );
  const byGoal = new Map(ratingsRes.rows.map((row) => [String(row.goal_id), String(row.achievement_text || "").trim()]));
  return goals.every((g) => (byGoal.get(String(g.goal_id)) || "").length > 0);
};

const isSelfSummarySubmitted = async (appraisalId) => {
  const table = await resolveSelfAppraisalTable();
  const submitted = await pool.query(
    `
    SELECT 1
    FROM ${table}
    WHERE appraisal_id = $1
      AND COALESCE(status, 'submitted') IN ('submitted', 'ro_reviewed', 'revo_reviewed', 'ao_finalized', 'completed')
    LIMIT 1
    `,
    [appraisalId]
  );
  return submitted.rows.length > 0;
};

const reconcileAppraisalReadyForRO = async (appraisal) => {
  if (!appraisal) return appraisal;
  let working = await ensureAppraisalOfficerAssignments(appraisal);

  if (["self_appraisal_done", "ro_rated", "revo_rated", "ao_accepted", "completed"].includes(working.status)) {
    return working;
  }

  const [summarySubmitted, achievementsDone] = await Promise.all([
    isSelfSummarySubmitted(working.id),
    hasAllFinalAchievements(working.id, working.employee_id, working.cycle_id)
  ]);

  if (!summarySubmitted || !achievementsDone) return working;

  const updated = await pool.query(
    "UPDATE appraisals SET status = 'self_appraisal_done', self_appraisal_submitted_at = COALESCE(self_appraisal_submitted_at, NOW()), updated_at = NOW() WHERE id = $1 RETURNING *",
    [working.id]
  );
  return updated.rows[0] || working;
};

const submitSelfSummary = async (req, res, next) => {
  try {
    const { cycleId, year, selfSummary, goalRatings, reviewId } = req.body;
    await ensureReviewSchema();

    const cycle = await getActiveOrByYearCycle(cycleId, year);
    if (!cycle) return res.status(400).json({ error: "Appraisal cycle not found" });
    if (req.user.role === ROLES.EMPLOYEE) {
      assertCycleWindowOpen({
        cycle,
        windowKey: "annualOpen",
        message: "Year-end self-appraisal is not open for the current date."
      });
    }

    const appraisal = await ensureAppraisal(req.user.id, cycle.cycle_id);
    const targetAppraisalId = reviewId || appraisal.id;

    const appRes = await pool.query("SELECT * FROM appraisals WHERE id = $1 LIMIT 1", [targetAppraisalId]);
    let dbAppraisal = appRes.rows[0];
    if (!dbAppraisal) return res.status(404).json({ error: "Appraisal not found" });
    if (dbAppraisal.employee_id !== req.user.userId) return res.status(403).json({ error: "This appraisal is not assigned to you" });
    dbAppraisal = await ensureAppraisalOfficerAssignments(dbAppraisal);
    if (["self_appraisal_done", "ro_rated", "revo_rated", "ao_accepted", "completed"].includes(dbAppraisal.status)) {
      return res.status(409).json({
        error: "Self-appraisal already submitted and locked",
        required: "editable state",
        current: dbAppraisal.status
      });
    }

    const goalsRes = await pool.query(
      "SELECT goal_id, status FROM goals WHERE user_id = $1 AND cycle_id = $2 ORDER BY created_at ASC",
      [dbAppraisal.employee_id, dbAppraisal.cycle_id]
    );
    if (!goalsRes.rows.length) {
      return res.status(400).json({ error: "Please submit goals before self-appraisal" });
    }

    const goalRatingsRes = await pool.query(
      "SELECT goal_id, achievement_text FROM appraisal_ratings WHERE appraisal_id = $1 ORDER BY created_at ASC",
      [dbAppraisal.id]
    );
    const filledGoalIds = new Set(
      goalRatingsRes.rows.filter((row) => String(row.achievement_text || "").trim().length > 0).map((row) => String(row.goal_id))
    );
    const missingFinalAchievements = goalsRes.rows
      .map((row) => String(row.goal_id))
      .filter((goalId) => !filledGoalIds.has(goalId));
    if (missingFinalAchievements.length > 0) {
      return res.status(400).json({
        error: "Fill the final achievement for every goal before submitting the self-summary",
        missingGoalIds: missingFinalAchievements
      });
    }

    const selfAppraisalTable = await resolveSelfAppraisalTable();
    const existingSelfAppraisal = await pool.query(
      `SELECT id FROM ${selfAppraisalTable} WHERE appraisal_id = $1 LIMIT 1`,
      [dbAppraisal.id]
    );
    const selfAppraisalId = existingSelfAppraisal.rows[0]?.id || crypto.randomUUID();
    await pool.query(
      `
      INSERT INTO ${selfAppraisalTable} (id, appraisal_id, employee_id, cycle_id, self_summary, status, submitted_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,'submitted',NOW(),NOW())
      ON CONFLICT (appraisal_id)
      DO UPDATE SET self_summary = EXCLUDED.self_summary, status = 'submitted', submitted_at = NOW(), updated_at = NOW()
      `,
      [selfAppraisalId, dbAppraisal.id, dbAppraisal.employee_id, dbAppraisal.cycle_id, String(selfSummary || "")]
    );

    await ensureGoalRatings({ appraisalId: dbAppraisal.id, goals: goalsRes.rows, providedRatings: goalRatings || [] });

    await pool.query(
      "UPDATE appraisals SET status = 'self_appraisal_done', self_appraisal_submitted_at = NOW() WHERE id = $1",
      [dbAppraisal.id]
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
    const ownership = await ensureIsROForAppraisal(appraisal.id, req.user.userId);
    if (!ownership.ok) return res.status(ownership.error === "Appraisal not found" ? 404 : 403).json({ error: ownership.error });

    await pool.query("UPDATE appraisal_ratings SET ro_rating = $1, updated_at = NOW() WHERE appraisal_id = $2", [
      Number(score || 0),
      appraisal.id
    ]);
    await upsertAttributeRatings({
      appraisalId: appraisal.id,
      userId: req.user.userId,
      role: ROLES.REPORTING_OFFICER,
      ratings: attributeRatings
    });

    await updateAppraisalStage({
      appraisalId: appraisal.id,
      nextStatus: "ro_rated",
      reviewedAtCandidates: ["ro_reviewed_at", "ro_rated_at"],
      remarksField: "ro_remarks",
      remarksValue: remarks || null
    });

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
    const ownership = await ensureIsRevOForAppraisal(appraisal.id, req.user.userId);
    if (!ownership.ok) return res.status(ownership.error === "Appraisal not found" ? 404 : 403).json({ error: ownership.error });

    // RevO sets its own rating (does not expose RO values while editing; handled in getRevoForm)
    await pool.query(
      "UPDATE appraisal_ratings SET revo_rating = $1, updated_at = NOW() WHERE appraisal_id = $2",
      [Number(score || 0), appraisal.id]
    );
    await upsertAttributeRatings({
      appraisalId: appraisal.id,
      userId: req.user.userId,
      role: ROLES.REVIEWING_OFFICER,
      ratings: attributeRatings
    });

    await updateAppraisalStage({
      appraisalId: appraisal.id,
      nextStatus: "revo_rated",
      reviewedAtCandidates: ["revo_reviewed_at", "revo_rated_at"],
      remarksField: "revo_remarks",
      remarksValue: remarks || null
    });

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
    const ownership = await ensureIsAOForAppraisal(appraisal.id, req.user.userId);
    if (!ownership.ok) return res.status(ownership.error === "Appraisal not found" ? 404 : 403).json({ error: ownership.error });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        "UPDATE appraisal_ratings SET ao_rating = $1, updated_at = NOW() WHERE appraisal_id = $2",
        [Number(score || 0), appraisal.id]
      );
      await upsertAttributeRatings({
        appraisalId: appraisal.id,
        userId: req.user.userId,
        role: ROLES.ACCEPTING_OFFICER,
        ratings: attributeRatings,
        client
      });

      const appraisalCols = await getAppraisalColumns();
      const aoReviewedAtField = resolveExistingColumn(appraisalCols, ["ao_reviewed_at", "ao_accepted_at"]);
      const aoSetFragments = ["ao_remarks = $1", "status = 'ao_accepted'"];
      if (aoReviewedAtField) aoSetFragments.push(`${aoReviewedAtField} = NOW()`);
      await client.query(
        `UPDATE appraisals SET ${aoSetFragments.join(", ")} WHERE id = $2`,
        [remarks || null, appraisal.id]
      );

      const { finalScore } = await computeScore(appraisal.id, { actorId: req.user.userId, transaction: client });

      await client.query("UPDATE appraisals SET status = 'completed', completed_at = NOW() WHERE id = $1", [appraisal.id]);
      const selfAppraisalTable = await resolveSelfAppraisalTable();
      await client.query(`UPDATE ${selfAppraisalTable} SET status = 'ao_finalized', updated_at = NOW() WHERE appraisal_id = $1`, [
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
      ORDER BY a.id DESC
      `,
      [req.user.userId]
    );
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
};

const getMyGoalsForYearEnd = async (req, res, next) => {
  try {
    await ensureReviewSchema();
    const { cycleId, year } = req.query;
    const employeeId = req.user.userId || req.user.id;

    const cycle = await getActiveOrByYearCycle(cycleId, year);
    if (!cycle) return res.status(400).json({ error: "Appraisal cycle not found" });

    // Ensure an appraisal exists so goal ratings can be saved immediately.
    const appraisal = await ensureAppraisal(employeeId, cycle.cycle_id);

    const goalColumns = await getTableColumns("goals");
    const goalsWhereClause = goalColumns.has("appraisal_id")
      ? "(g.appraisal_id = $1 OR (g.user_id = $2 AND g.cycle_id = $3))"
      : "g.user_id = $2 AND g.cycle_id = $3";

    const goalsRes = await pool.query(
      `
      SELECT
        g.goal_id,
        g.goal_title,
        g.goal_description,
        g.status,
        agr.self_rating,
        agr.achievement_text,
        agr.ro_rating,
        agr.ro_remarks,
        smr.progress_text AS six_month_progress_text
      FROM goals g
      LEFT JOIN appraisal_ratings agr
        ON agr.goal_id = g.goal_id
       AND agr.appraisal_id = $1
      LEFT JOIN six_month_review smr
        ON smr.goal_id = g.goal_id
       AND smr.employee_id = $2
       AND smr.cycle_id = $3
      WHERE ${goalsWhereClause}
      ORDER BY g.created_at ASC
      `,
      [appraisal.id, employeeId, cycle.cycle_id]
    );

    return res.json({
      appraisalId: appraisal.id,
      cycleId: cycle.cycle_id,
      goals: goalsRes.rows.map((g) => ({
        id: g.goal_id,
        goalTitle: g.goal_title,
        goalDescription: g.goal_description,
        status: g.status,
        selfRating: g.self_rating,
        achievementText: g.achievement_text,
        roRating: g.ro_rating,
        roRemarks: g.ro_remarks,
        sixMonthProgressText: g.six_month_progress_text
      }))
    });
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
        ORDER BY a.self_appraisal_submitted_at DESC NULLS LAST, a.goals_submitted_at DESC NULLS LAST, a.id DESC
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
        LEFT JOIN appraisal_cycle_participants p ON p.cycle_id = a.cycle_id AND p.employee_id = a.employee_id
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN appraisal_cycles c ON c.cycle_id = a.cycle_id
        WHERE (a.ro_id = $1 OR p.reporting_officer_id = $1)
        ORDER BY a.self_appraisal_submitted_at DESC NULLS LAST, a.goals_submitted_at DESC NULLS LAST, a.id DESC
        `,
        [req.user.userId]
      );

      const reconciledRows = [];
      const seen = new Set();
      for (const row of rows) {
        if (seen.has(String(row.id))) continue;
        seen.add(String(row.id));
        const updated = await reconcileAppraisalReadyForRO(row);
        if (updated.ro_id !== req.user.userId) continue;
        reconciledRows.push({ ...row, ...updated });
      }

      return res.json(
        reconciledRows.map((r) => ({
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
        WHERE a.revo_id = $1
        ORDER BY a.self_appraisal_submitted_at DESC NULLS LAST, a.goals_submitted_at DESC NULLS LAST, a.id DESC
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
        WHERE a.ao_id = $1
        ORDER BY a.self_appraisal_submitted_at DESC NULLS LAST, a.goals_submitted_at DESC NULLS LAST, a.id DESC
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
      FROM appraisal_ratings
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
      "SELECT goal_id, achievement_text, self_rating, ro_rating, revo_rating, ao_rating FROM appraisal_ratings WHERE appraisal_id = $1 ORDER BY created_at ASC",
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

const getAppraisalGoalsWithRatings = async (req, res, next) => {
  try {
    const { appraisalId } = req.params;
    await ensureReviewSchema();

    const appRes = await pool.query("SELECT * FROM appraisals WHERE id = $1 LIMIT 1", [appraisalId]);
    let appraisal = appRes.rows[0];
    if (!appraisal) return res.status(404).json({ error: "Appraisal not found" });
    appraisal = await reconcileAppraisalReadyForRO(appraisal);

    const role = req.user.role;
    const canAccess =
      roleMatches(role, ROLES.HR_ADMIN) ||
      (roleMatches(role, ROLES.EMPLOYEE) && appraisal.employee_id === req.user.userId) ||
      (roleMatches(role, ROLES.REPORTING_OFFICER) && appraisal.ro_id === req.user.userId) ||
      (roleMatches(role, ROLES.REVIEWING_OFFICER) && appraisal.revo_id === req.user.userId) ||
      (roleMatches(role, ROLES.ACCEPTING_OFFICER) && appraisal.ao_id === req.user.userId);
    if (!canAccess) return res.status(403).json({ error: "You don't have access to this appraisal" });

    const stage = getGoalReviewStage(appraisal.status);
    const selfAppraisalRecord = await getSelfAppraisalRecordForAppraisal({
      appraisalId,
      employeeId: appraisal.employee_id,
      cycleId: appraisal.cycle_id
    });
    const selfSummary = selfAppraisalRecord.summary || "";
    const legacyAchievementMap = await getLegacyAchievementMap({ selfAppraisalId: selfAppraisalRecord.id });
    const kpaAchievementMap = await getKpaAchievementMap({ appraisalId });

    const goalColumns = await getTableColumns("goals");
    const goalsWhereClause = goalColumns.has("appraisal_id")
      ? "(g.appraisal_id = $1 OR (g.user_id = $2 AND g.cycle_id = $3))"
      : "g.user_id = $2 AND g.cycle_id = $3";

    const goalsRes = await pool.query(
      `
      SELECT
        g.goal_id,
        g.goal_title as goal_title,
        g.goal_description as goal_description,
        g.weightage,
        g.status,
        agr.achievement_text as achievement_text,
        agr.self_rating as selfRating,
        agr.ro_rating as roRating,
        agr.ro_remarks as roRemarks,
        agr.revo_rating as revoRating,
        agr.revo_remarks as revoRemarks,
        agr.ao_rating as aoRating,
        agr.ao_remarks as aoRemarks,
        smr.progress_text as six_month_progress_text,
        smrv.progress_text as six_month_progress_text_legacy
      FROM goals g
      LEFT JOIN appraisal_ratings agr ON agr.goal_id = g.goal_id AND agr.appraisal_id = $1
      LEFT JOIN six_month_review smr ON smr.goal_id = g.goal_id AND smr.employee_id = $2 AND smr.cycle_id = $3
      LEFT JOIN six_month_reviews smrv ON smrv.goal_id = g.goal_id AND smrv.employee_id = $2 AND smrv.cycle_id = $3
      WHERE ${goalsWhereClause}
      ORDER BY g.created_at ASC
      `,
      [appraisalId, appraisal.employee_id, appraisal.cycle_id]
    );

    return res.json({
      appraisal: {
        id: appraisal.id,
        status: appraisal.status,
        employee: {
          id: appraisal.employee_id
        }
      },
      stage: stage?.role || null,
      canEdit: Boolean(stage && roleMatches(role, stage.role)),
      selfSummary,
      goals: goalsRes.rows.map((g) => ({
        id: g.goal_id,
        goalTitle: g.goal_title,
        goalDescription: g.goal_description,
        weightage: g.weightage,
        status: g.status,
        sixMonthProgressText: String(g.six_month_progress_text || "").trim() || String(g.six_month_progress_text_legacy || "").trim() || "",
        achievementText:
          String(g.achievement_text || "").trim() ||
          String(legacyAchievementMap.get(String(g.goal_id)) || "").trim() ||
          String(kpaAchievementMap.get(String(g.goal_id)) || "").trim() ||
          "",
        selfRating: g.selfRating,
        roRating: g.roRating,
        roRemarks: g.roRemarks,
        revoRating: g.revoRating,
        revoRemarks: g.revoRemarks,
        aoRating: g.aoRating,
        aoRemarks: g.aoRemarks
      }))
    });
  } catch (error) {
    return next(error);
  }
};

const updateGoalRating = async (req, res, next) => {
  try {
    const { appraisalId, goalId, selfRating, achievementText } = req.body;
    await ensureReviewSchema();

    // Verify appraisal belongs to user
    const appRes = await pool.query("SELECT id, employee_id, cycle_id, status FROM appraisals WHERE id = $1 LIMIT 1", [appraisalId]);
    const appraisal = appRes.rows[0];
    if (!appraisal) return res.status(404).json({ error: "Appraisal not found" });
    if (appraisal.employee_id !== req.user.userId) {
      return res.status(403).json({ error: "You don't have access to this appraisal" });
    }
    if (["self_appraisal_done", "ro_rated", "revo_rated", "ao_accepted", "completed"].includes(appraisal.status)) {
      return res.status(409).json({ error: "Self-appraisal already submitted and locked" });
    }

    // Verify goal belongs to user and cycle
    const goalRes = await pool.query("SELECT goal_id FROM goals WHERE goal_id = $1 AND user_id = $2 AND cycle_id = $3 LIMIT 1", [goalId, appraisal.employee_id, appraisal.cycle_id]);
    if (!goalRes.rows.length) return res.status(404).json({ error: "Goal not found in this appraisal" });

    // Update or create goal rating
    const id = crypto.randomUUID();
    await pool.query(
      `
      INSERT INTO appraisal_ratings (id, appraisal_id, goal_id, self_rating, achievement_text, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (appraisal_id, goal_id)
      DO UPDATE SET self_rating = EXCLUDED.self_rating, achievement_text = EXCLUDED.achievement_text, updated_at = NOW()
      `,
      [id, appraisalId, goalId, Number(selfRating || 3), String(achievementText || "")]
    );

    await writeAudit({ user: req.user, action: "update", entity: "goal_rating", entityId: `${appraisalId}-${goalId}` });
    return res.json({ success: true, selfRating: Number(selfRating || 3), achievementText: String(achievementText || "") });
  } catch (error) {
    return next(error);
  }
};

const submitAnnualGoalRatings = async (req, res, next) => {
  try {
    const { appraisalId, goals = [] } = req.body;
    await ensureReviewSchema();

    const appRes = await pool.query("SELECT id, employee_id, cycle_id, status FROM appraisals WHERE id = $1 LIMIT 1", [appraisalId]);
    const appraisal = appRes.rows[0];
    if (!appraisal) return res.status(404).json({ error: "Appraisal not found" });
    if (appraisal.employee_id !== req.user.userId) {
      return res.status(403).json({ error: "You don't have access to this appraisal" });
    }
    if (["self_appraisal_done", "ro_rated", "revo_rated", "ao_accepted", "completed"].includes(appraisal.status)) {
      return res.status(409).json({ error: "Annual goals are already locked" });
    }

    const goalRes = await pool.query(
      "SELECT goal_id FROM goals WHERE user_id = $1 AND cycle_id = $2 AND status IN ('approved', 'submitted') ORDER BY created_at ASC",
      [appraisal.employee_id, appraisal.cycle_id]
    );
    const expectedGoalIds = goalRes.rows.map((row) => String(row.goal_id));
    const payloadMap = new Map(
      goals.map((goal) => [String(goal.goalId), String(goal.achievementText || "").trim()])
    );

    const missingGoals = [];
    for (const goalId of expectedGoalIds) {
      const achievementText = payloadMap.get(goalId) ?? "";
      if (!achievementText) {
        missingGoals.push(goalId);
        continue;
      }

      const existingId = crypto.randomUUID();
      await pool.query(
        `
        INSERT INTO appraisal_ratings (id, appraisal_id, goal_id, self_rating, achievement_text, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (appraisal_id, goal_id)
        DO UPDATE SET achievement_text = EXCLUDED.achievement_text, updated_at = NOW()
        `,
        [existingId, appraisalId, goalId, 3, achievementText]
      );
    }

    if (missingGoals.length > 0) {
      return res.status(400).json({
        error: "Fill final achievement for every goal before submitting",
        missingGoals
      });
    }

    await writeAudit({ user: req.user, action: "submit", entity: "annual_goal_ratings", entityId: appraisalId });
    return res.json({ success: true, message: "Annual goals submitted successfully" });
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
  getMyGoalsForYearEnd,
  listQueue,
  listAttributeMasters,
  getRevoForm,
  getAoForm,
  getAppraisalGoalsWithRatings,
  updateGoalRating,
  submitAnnualGoalRatings,
  submitGoalStageRatings
};
