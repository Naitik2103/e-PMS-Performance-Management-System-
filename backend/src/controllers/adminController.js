import { writeAudit } from "../services/auditService.js";
import pool from "../config/db.js";

const listCycles = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        cycle_id,
        cycle_name,
        cycle_year,
        goal_setting_start,
        goal_setting_end,
        six_month_progress_review_start,
        six_month_progress_review_end,
        annual_appraisal_start,
        annual_appraisal_end,
        created_at,
        closed_at
      FROM appraisal_cycles
      ORDER BY cycle_year::int DESC, created_at DESC
      `
    );

    const mapped = rows.map((c) => {
      const isActive = !c.closed_at;
      return {
        id: c.cycle_id,
        name: c.cycle_name,
        year: Number(c.cycle_year),
        goalSettingStart: c.goal_setting_start,
        goalSettingEnd: c.goal_setting_end,
        sixMonthProgressReviewStart: c.six_month_progress_review_start,
        sixMonthProgressReviewEnd: c.six_month_progress_review_end,
        annualAppraisalStart: c.annual_appraisal_start,
        annualAppraisalEnd: c.annual_appraisal_end,
        isActive,
        status: isActive ? "active" : "closed",
        createdAt: c.created_at,
        closedAt: c.closed_at
      };
    });

    return res.json(mapped);
  } catch (error) {
    return next(error);
  }
};

const createCycle = async (req, res, next) => {
  try {
    const year = String(req.body.year ?? "").trim();
    if (!year) {
      res.status(400);
      return next(new Error("Year is required"));
    }

    const dupe = await pool.query("SELECT 1 FROM appraisal_cycles WHERE cycle_year = $1 LIMIT 1", [year]);
    if (dupe.rows.length) {
      res.status(409);
      return next(new Error("An appraisal cycle already exists for this year"));
    }

    const name = String(req.body.name || req.body.cycle_name || `Annual Appraisal ${year}`).trim();
    const goalSettingStart = req.body.goalSettingStart || null;
    const goalSettingEnd = req.body.goalSettingEnd || null;
    const sixMonthProgressReviewStart = req.body.sixMonthProgressReviewStart || null;
    const sixMonthProgressReviewEnd = req.body.sixMonthProgressReviewEnd || null;
    const annualAppraisalStart = req.body.annualAppraisalStart || null;
    const annualAppraisalEnd = req.body.annualAppraisalEnd || null;
    const createdBy = req.user?.id || req.user?.userId || null;
    const isActive = Boolean(req.body.isActive ?? true);

    // If this new cycle is active, close any currently-active cycle (closed_at is null).
    if (isActive) {
      await pool.query("UPDATE appraisal_cycles SET closed_at = NOW() WHERE closed_at IS NULL");
    }

    const inserted = await pool.query(
      `
      INSERT INTO appraisal_cycles
        (cycle_name, cycle_year, goal_setting_start, goal_setting_end,
         six_month_progress_review_start, six_month_progress_review_end,
         annual_appraisal_start, annual_appraisal_end, created_by, created_at, closed_at)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10)
      RETURNING cycle_id, cycle_name, cycle_year, goal_setting_start, goal_setting_end,
                six_month_progress_review_start, six_month_progress_review_end,
                annual_appraisal_start, annual_appraisal_end, created_at, closed_at
      `,
      [
        name,
        year,
        goalSettingStart,
        goalSettingEnd,
        sixMonthProgressReviewStart,
        sixMonthProgressReviewEnd,
        annualAppraisalStart,
        annualAppraisalEnd,
        createdBy,
        isActive ? null : new Date()
      ]
    );

    const c = inserted.rows[0];
    const out = {
      id: c.cycle_id,
      name: c.cycle_name,
      year: Number(c.cycle_year),
      goalSettingStart: c.goal_setting_start,
      goalSettingEnd: c.goal_setting_end,
      sixMonthProgressReviewStart: c.six_month_progress_review_start,
      sixMonthProgressReviewEnd: c.six_month_progress_review_end,
      annualAppraisalStart: c.annual_appraisal_start,
      annualAppraisalEnd: c.annual_appraisal_end,
      isActive: !c.closed_at,
      status: c.closed_at ? "closed" : "active",
      createdAt: c.created_at,
      closedAt: c.closed_at
    };

    await writeAudit({ user: req.user, action: "create", entity: "appraisal_cycle", entityId: out.id, details: { year } });
    return res.status(201).json(out);
  } catch (error) {
    return next(error);
  }
};

const updateCycle = async (req, res, next) => {
  try {
    const id = req.params.id;
    const current = await pool.query("SELECT cycle_id, cycle_year, closed_at FROM appraisal_cycles WHERE cycle_id = $1 LIMIT 1", [id]);
    if (!current.rows.length) {
      res.status(404);
      return next(new Error("Cycle not found"));
    }

    const year = req.body.year ? String(req.body.year).trim() : null;
    if (year && year !== String(current.rows[0].cycle_year)) {
      const dupe = await pool.query("SELECT 1 FROM appraisal_cycles WHERE cycle_year = $1 LIMIT 1", [year]);
      if (dupe.rows.length) {
        res.status(409);
        return next(new Error("An appraisal cycle already exists for this year"));
      }
    }

    const isActive = req.body.isActive === undefined ? null : Boolean(req.body.isActive);
    if (isActive === true) {
      await pool.query("UPDATE appraisal_cycles SET closed_at = NOW() WHERE closed_at IS NULL AND cycle_id <> $1", [id]);
    }

    await pool.query(
      `
      UPDATE appraisal_cycles SET
        cycle_name = COALESCE($2, cycle_name),
        cycle_year = COALESCE($3, cycle_year),
        goal_setting_start = COALESCE($4, goal_setting_start),
        goal_setting_end = COALESCE($5, goal_setting_end),
        six_month_progress_review_start = COALESCE($6, six_month_progress_review_start),
        six_month_progress_review_end = COALESCE($7, six_month_progress_review_end),
        annual_appraisal_start = COALESCE($8, annual_appraisal_start),
        annual_appraisal_end = COALESCE($9, annual_appraisal_end),
        closed_at = CASE
          WHEN $10::boolean IS NULL THEN closed_at
          WHEN $10 = true THEN NULL
          ELSE NOW()
        END
      WHERE cycle_id = $1
      `,
      [
        id,
        req.body.name || null,
        year,
        req.body.goalSettingStart || null,
        req.body.goalSettingEnd || null,
        req.body.sixMonthProgressReviewStart || null,
        req.body.sixMonthProgressReviewEnd || null,
        req.body.annualAppraisalStart || null,
        req.body.annualAppraisalEnd || null,
        isActive
      ]
    );

    await writeAudit({ user: req.user, action: "update", entity: "appraisal_cycle", entityId: id });
    const updated = await pool.query(
      `
      SELECT cycle_id, cycle_name, cycle_year, goal_setting_start, goal_setting_end,
             six_month_progress_review_start, six_month_progress_review_end,
             annual_appraisal_start, annual_appraisal_end, created_at, closed_at
      FROM appraisal_cycles
      WHERE cycle_id = $1
      `,
      [id]
    );
    const c = updated.rows[0];
    return res.json({
      id: c.cycle_id,
      name: c.cycle_name,
      year: Number(c.cycle_year),
      goalSettingStart: c.goal_setting_start,
      goalSettingEnd: c.goal_setting_end,
      sixMonthProgressReviewStart: c.six_month_progress_review_start,
      sixMonthProgressReviewEnd: c.six_month_progress_review_end,
      annualAppraisalStart: c.annual_appraisal_start,
      annualAppraisalEnd: c.annual_appraisal_end,
      isActive: !c.closed_at,
      status: c.closed_at ? "closed" : "active"
    });
  } catch (error) {
    return next(error);
  }
};

export { listCycles, createCycle, updateCycle };
