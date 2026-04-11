import bcrypt from "bcryptjs";
import pool from "../config/db.js";
import { ROLES, normalizeRole } from "../constants/rbac.js";
import { writeAudit } from "../services/auditService.js";

const buildFullName = (firstName, lastName) =>
  [String(firstName || "").trim(), String(lastName || "").trim()].filter(Boolean).join(" ").trim();

const ensureParticipantsForCycle = async (cycleId, client = pool) => {
  // Insert one participant row per active non-admin user only if missing.
  await client.query(
    `
    INSERT INTO appraisal_cycle_participants (
      id, cycle_id, employee_id, reporting_officer_id, reviewing_officer_id, accepting_officer_id, is_eligible, created_at, updated_at
    )
    SELECT
      gen_random_uuid(),
      $1,
      u.user_id,
      NULL,
      NULL,
      NULL,
      true,
      NOW(),
      NOW()
    FROM users u
    LEFT JOIN appraisal_cycle_participants acp
      ON acp.cycle_id = $1 AND acp.employee_id = u.user_id
    WHERE u.is_active = true
      AND u.role <> $2
      AND acp.id IS NULL
    `,
    [cycleId, ROLES.HR_ADMIN]
  );
};

const getAllUsersForDropdowns = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        u.user_id AS id,
        COALESCE(NULLIF(TRIM(u.full_name), ''), CONCAT_WS(' ', u.first_name, u.last_name)) AS "fullName",
        u.employee_id AS "employeeId",
        u.role,
        u.is_active AS "isActive",
        u.reporting_to AS "reportingTo",
        d.name AS department,
        COALESCE(des.title, '') AS designation
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN designations des ON des.id = u.designation_id
      WHERE u.is_active = true
      ORDER BY COALESCE(NULLIF(TRIM(u.full_name), ''), CONCAT_WS(' ', u.first_name, u.last_name))
      `
    );
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
};

const getDepartmentsAndDesignations = async (req, res, next) => {
  try {
    const [deptRes, desRes] = await Promise.all([
      pool.query(`SELECT id, name, code FROM departments ORDER BY name`),
      pool.query(`SELECT id, title, grade_level AS "gradeLevel" FROM designations ORDER BY title`)
    ]);
    return res.json({
      departments: deptRes.rows,
      designations: desRes.rows
    });
  } catch (error) {
    return next(error);
  }
};

const createHrUser = async (req, res, next) => {
  try {
    const {
      firstName: firstNameRaw,
      lastName: lastNameRaw,
      email,
      phone,
      departmentId,
      role,
      reportingTo,
      temporaryPassword
    } = req.body;

    const emailValue = String(email || "")
      .trim()
      .toLowerCase();

    const firstName = String(firstNameRaw ?? "").trim();
    const lastName = String(lastNameRaw ?? "").trim();
    const fullName = buildFullName(firstName, lastName);

    if (!firstName || !lastName || !emailValue || !departmentId || !role || !temporaryPassword) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (String(temporaryPassword).length < 8) {
      return res.status(400).json({ error: "Temporary password must be at least 8 characters" });
    }

    const existingEmail = await pool.query(`SELECT user_id FROM users WHERE LOWER(email) = $1 LIMIT 1`, [emailValue]);
    if (existingEmail.rows.length) {
      return res.status(409).json({ field: "email", error: "This email already exists in the system" });
    }

    const hashedPassword = await bcrypt.hash(String(temporaryPassword), 10);
    const normalizedRole = normalizeRole(role);

    const phoneVal = phone ? String(phone).trim() : null;
    const reportingToId = reportingTo || null;

    const returning = `
      RETURNING user_id, first_name, last_name, full_name, employee_id, email, phone, role, department_id, designation_id, reporting_to, ro_id, is_active, created_at
    `;

    const insertWithoutEmployeeId = () =>
      pool.query(
        `
        INSERT INTO users (
          first_name, last_name, full_name, employee_id, email, phone,
          department_id, designation_id, role, reporting_to, ro_id, rew_id, ao_id,
          password_hash, is_active, created_at, updated_at
        )
        VALUES ($1, $2, $3, NULL, $4, $5, $6, NULL, $7, $8, NULL, NULL, NULL, $9, true, NOW(), NOW())
        ${returning}
        `,
        [firstName, lastName, fullName, emailValue, phoneVal, departmentId, normalizedRole, reportingToId, hashedPassword]
      );

    const insertWithEmployeeId = (empId) =>
      pool.query(
        `
        INSERT INTO users (
          first_name, last_name, full_name, employee_id, email, phone,
          department_id, designation_id, role, reporting_to, ro_id, rew_id, ao_id,
          password_hash, is_active, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, NULL, NULL, NULL, $10, true, NOW(), NOW())
        ${returning}
        `,
        [firstName, lastName, fullName, empId, emailValue, phoneVal, departmentId, normalizedRole, reportingToId, hashedPassword]
      );

    let inserted;
    try {
      inserted = await insertWithoutEmployeeId();
    } catch (e) {
      if (e.code === "23502" && String(e.message || "").toLowerCase().includes("employee_id")) {
        const { randomUUID } = await import("crypto");
        const generatedEmployeeId = `EMP-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
        inserted = await insertWithEmployeeId(generatedEmployeeId);
      } else {
        throw e;
      }
    }

    const row = inserted.rows[0];
    await writeAudit({
      user: req.user,
      action: "USER_CREATED",
      entity: "user",
      entityId: row.user_id,
      details: { email: row.email }
    });

    const dept = await pool.query(`SELECT name FROM departments WHERE id = $1`, [row.department_id]);

    return res.status(201).json({
      id: row.user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      department: dept.rows[0]?.name || null,
      designation: null,
      role: row.role,
      reportingTo: row.reporting_to,
      isActive: row.is_active,
      createdAt: row.created_at
    });
  } catch (error) {
    return next(error);
  }
};

const mapCycleRow = (c) => {
  const status = c.status || (c.closed_at ? "closed" : "active");
  const fy = c.financial_year || c.cycle_year;
  return {
    id: c.cycle_id,
    cycleName: c.cycle_name,
    financialYear: fy != null ? String(fy) : null,
    cycle_year: c.cycle_year,
    goalSettingStart: c.goal_setting_start,
    goalSettingEnd: c.goal_setting_end,
    sixMonthReviewStart: c.six_month_progress_review_start,
    sixMonthReviewEnd: c.six_month_progress_review_end,
    sixMonthProgressReviewStart: c.six_month_progress_review_start,
    sixMonthProgressReviewEnd: c.six_month_progress_review_end,
    annualAppraisalStart: c.annual_appraisal_start,
    annualAppraisalEnd: c.annual_appraisal_end,
    status,
    created_at: c.created_at,
    activated_at: c.activated_at,
    closed_at: c.closed_at,
    participantStats: c.participantStats
  };
};

const listCyclesWithStats = async (req, res, next) => {
  try {
    const { rows: cycles } = await pool.query(
      `SELECT * FROM appraisal_cycles ORDER BY created_at DESC`
    );

    for (const cycle of cycles) {
      const { rows: participants } = await pool.query(
        `SELECT reporting_officer_id, reviewing_officer_id, accepting_officer_id FROM appraisal_cycle_participants WHERE cycle_id = $1`,
        [cycle.cycle_id]
      );
      cycle.participantStats = {
        total: participants.length,
        fullyAssigned: participants.filter(
          (p) => p.reporting_officer_id && p.reviewing_officer_id && p.accepting_officer_id
        ).length,
        partial: participants.filter(
          (p) =>
            (p.reporting_officer_id || p.reviewing_officer_id || p.accepting_officer_id) &&
            !(p.reporting_officer_id && p.reviewing_officer_id && p.accepting_officer_id)
        ).length,
        notAssigned: participants.filter(
          (p) => !p.reporting_officer_id && !p.reviewing_officer_id && !p.accepting_officer_id
        ).length
      };
    }

    return res.json(cycles.map(mapCycleRow));
  } catch (error) {
    return next(error);
  }
};

const createCycleWithParticipants = async (req, res, next) => {
  try {
    const {
      cycleName,
      financialYear,
      goalSettingStart,
      goalSettingEnd,
      sixMonthReviewStart,
      sixMonthReviewEnd,
      annualAppraisalStart,
      annualAppraisalEnd
    } = req.body;

    const fy = String(financialYear || "").trim();
    if (!fy || !cycleName) {
      return res.status(400).json({ error: "Cycle name and financial year are required" });
    }

    const existing = await pool.query(
      `
      SELECT cycle_id FROM appraisal_cycles
      WHERE LOWER(TRIM(COALESCE(financial_year::text, ''))) = LOWER($1)
         OR LOWER(TRIM(cycle_year::text)) = LOWER($1)
      LIMIT 1
      `,
      [fy]
    );
    if (existing.rows.length) {
      return res.status(409).json({ error: "A cycle for this financial year already exists" });
    }

    const createdBy = req.user?.userId || req.user?.id || null;

    const client = await pool.connect();
    let newCycle;
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `
        INSERT INTO appraisal_cycles (
          cycle_name,
          cycle_year,
          financial_year,
          goal_setting_start,
          goal_setting_end,
          six_month_progress_review_start,
          six_month_progress_review_end,
          annual_appraisal_start,
          annual_appraisal_end,
          created_by,
          created_at,
          closed_at,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NULL, 'draft')
        RETURNING *
        `,
        [
          String(cycleName).trim(),
          fy,
          fy,
          goalSettingStart || null,
          goalSettingEnd || null,
          sixMonthReviewStart || null,
          sixMonthReviewEnd || null,
          annualAppraisalStart || null,
          annualAppraisalEnd || null,
          createdBy
        ]
      );
      newCycle = inserted.rows[0];

      await ensureParticipantsForCycle(newCycle.cycle_id, client);

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    const { rows: activeEmployees } = await pool.query(
      `SELECT user_id FROM users WHERE is_active = true AND role <> $1`,
      [ROLES.HR_ADMIN]
    );

    await writeAudit({
      user: req.user,
      action: "create",
      entity: "appraisal_cycle",
      entityId: newCycle.cycle_id,
      details: { financialYear: fy }
    });

    const withStats = { ...newCycle, participantStats: { total: activeEmployees.length, fullyAssigned: 0, partial: 0, notAssigned: activeEmployees.length } };
    return res.status(201).json(mapCycleRow(withStats));
  } catch (error) {
    return next(error);
  }
};

const getCycleParticipants = async (req, res, next) => {
  try {
    const cycleId = req.params.cycleId || req.params.id;

    // Auto-heal legacy/partially-created cycles with missing participant rows.
    await ensureParticipantsForCycle(cycleId);

    const { rows: participants } = await pool.query(
      `
      SELECT
        acp.id AS "participantId",
        emp.user_id AS "employeeId",
        COALESCE(NULLIF(TRIM(emp.full_name), ''), CONCAT_WS(' ', emp.first_name, emp.last_name)) AS "employeeName",
        emp.employee_id AS "employeeCode",
        dept.name AS department,
        des.title AS designation,
        acp.reporting_officer_id AS "reportingOfficerId",
        COALESCE(NULLIF(TRIM(ro.full_name), ''), CONCAT_WS(' ', ro.first_name, ro.last_name)) AS "reportingOfficerName",
        acp.reviewing_officer_id AS "reviewingOfficerId",
        COALESCE(NULLIF(TRIM(revo.full_name), ''), CONCAT_WS(' ', revo.first_name, revo.last_name)) AS "reviewingOfficerName",
        acp.accepting_officer_id AS "acceptingOfficerId",
        COALESCE(NULLIF(TRIM(ao.full_name), ''), CONCAT_WS(' ', ao.first_name, ao.last_name)) AS "acceptingOfficerName"
      FROM appraisal_cycle_participants acp
      JOIN users emp ON emp.user_id = acp.employee_id
      LEFT JOIN departments dept ON dept.id = emp.department_id
      LEFT JOIN designations des ON des.id = emp.designation_id
      LEFT JOIN users ro ON ro.user_id = acp.reporting_officer_id
      LEFT JOIN users revo ON revo.user_id = acp.reviewing_officer_id
      LEFT JOIN users ao ON ao.user_id = acp.accepting_officer_id
      WHERE acp.cycle_id = $1
      ORDER BY COALESCE(NULLIF(TRIM(emp.full_name), ''), CONCAT_WS(' ', emp.first_name, emp.last_name))
      `,
      [cycleId]
    );

    const result = participants.map((p) => ({
      ...p,
      assignmentStatus:
        p.reportingOfficerId && p.reviewingOfficerId && p.acceptingOfficerId
          ? "complete"
          : p.reportingOfficerId || p.reviewingOfficerId || p.acceptingOfficerId
            ? "partial"
            : "empty"
    }));

    if (req.query.includeCycle === "1") {
      const { rows: cycleRows } = await pool.query(
        `
        SELECT
          cycle_id AS id,
          cycle_name AS "cycleName",
          financial_year AS "financialYear",
          goal_setting_start AS "goalSettingStart",
          goal_setting_end AS "goalSettingEnd",
          six_month_progress_review_start AS "sixMonthReviewStart",
          six_month_progress_review_end AS "sixMonthReviewEnd",
          annual_appraisal_start AS "annualAppraisalStart",
          annual_appraisal_end AS "annualAppraisalEnd",
          status
        FROM appraisal_cycles
        WHERE cycle_id = $1
        LIMIT 1
        `,
        [cycleId]
      );
      return res.json({ cycle: cycleRows[0] || null, participants: result });
    }

    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

const bulkSaveParticipants = async (req, res, next) => {
  try {
    const cycleId = req.params.cycleId || req.params.id;
    const { participants } = req.body;
    if (!Array.isArray(participants)) {
      return res.status(400).json({ error: "participants array is required" });
    }

    const conflicts = [];
    for (const p of participants) {
      if (p.reportingOfficerId && p.reportingOfficerId === p.employeeId) {
        conflicts.push("Employee cannot be their own Reporting Officer");
      }
      if (p.reviewingOfficerId && p.reviewingOfficerId === p.employeeId) {
        conflicts.push("Employee cannot be their own Reviewing Officer");
      }
      if (p.acceptingOfficerId && p.acceptingOfficerId === p.employeeId) {
        conflicts.push("Employee cannot be their own Accepting Officer");
      }
    }
    if (conflicts.length > 0) {
      return res.status(422).json({ errors: conflicts });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const p of participants) {
        const r = await client.query(
          `
          UPDATE appraisal_cycle_participants
          SET
            reporting_officer_id = $3,
            reviewing_officer_id = $4,
            accepting_officer_id = $5,
            updated_at = NOW()
          WHERE id = $1 AND cycle_id = $2
          `,
          [
            p.participantId,
            cycleId,
            p.reportingOfficerId || null,
            p.reviewingOfficerId || null,
            p.acceptingOfficerId || null
          ]
        );
        if (r.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Participant not found for this cycle" });
        }
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    await writeAudit({
      user: req.user,
      action: "PARTICIPANTS_UPDATED",
      entity: "appraisal_cycle",
      entityId: cycleId
    });

    return res.json({ message: "Assignments saved successfully" });
  } catch (error) {
    return next(error);
  }
};

const activateCycle = async (req, res, next) => {
  try {
    const cycleId = req.params.cycleId || req.params.id;

    const cur = await pool.query(`SELECT cycle_id, status FROM appraisal_cycles WHERE cycle_id = $1 LIMIT 1`, [cycleId]);
    if (!cur.rows.length) {
      return res.status(404).json({ error: "Cycle not found" });
    }
    if (cur.rows[0].status === "active") {
      return res.json({ message: "Cycle activated successfully" });
    }

    const anyActive = await pool.query(`SELECT cycle_id FROM appraisal_cycles WHERE status = 'active' LIMIT 1`);
    if (anyActive.rows.length && anyActive.rows[0].cycle_id !== cycleId) {
      return res.status(409).json({ error: "Another cycle is already active. Close it before activating this one." });
    }

    const incomplete = await pool.query(
      `
      SELECT COALESCE(NULLIF(TRIM(u.full_name), ''), CONCAT_WS(' ', u.first_name, u.last_name)) AS full_name
      FROM appraisal_cycle_participants p
      JOIN users u ON u.user_id = p.employee_id
      WHERE p.cycle_id = $1
        AND (
          p.reporting_officer_id IS NULL
          OR p.reviewing_officer_id IS NULL
          OR p.accepting_officer_id IS NULL
        )
      `,
      [cycleId]
    );

    if (incomplete.rows.length > 0) {
      return res.status(422).json({
        error: `Cannot activate — ${incomplete.rows.length} employees have incomplete assignments`,
        incomplete: incomplete.rows.map((u) => u.full_name)
      });
    }

    await pool.query(
      `
      UPDATE appraisal_cycles
      SET status = 'active', activated_at = NOW(), updated_at = NOW(), closed_at = NULL
      WHERE cycle_id = $1
      `,
      [cycleId]
    );

    await writeAudit({
      user: req.user,
      action: "update",
      entity: "appraisal_cycle",
      entityId: cycleId,
      details: { status: "active" }
    });

    return res.json({ message: "Cycle activated successfully" });
  } catch (error) {
    return next(error);
  }
};

export {
  getAllUsersForDropdowns,
  getDepartmentsAndDesignations,
  createHrUser,
  listCyclesWithStats,
  createCycleWithParticipants,
  getCycleParticipants,
  bulkSaveParticipants,
  activateCycle
};
