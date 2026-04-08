import pool from "../config/db.js";
import { ROLES, normalizeRole, roleMatches } from "../constants/rbac.js";

const mapAppraisalRow = (r) => ({
  ...r,
  employee: {
    id: r.employee_id,
    name: `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.email,
    department: r.department
  },
  cycle: r.cycle_id
    ? {
        id: r.cycle_id,
        name: r.cycle_name,
        year: r.cycle_year ? Number(r.cycle_year) : null
      }
    : null
});

const listMine = async (req, res, next) => {
  try {
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
      WHERE a.employee_id = $1
      ORDER BY a.created_at DESC
      `,
      [req.user.id]
    );
    return res.json(rows.map(mapAppraisalRow));
  } catch (error) {
    return next(error);
  }
};

const listMyTeam = async (req, res, next) => {
  try {
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
      WHERE a.ro_id = $1
      ORDER BY a.created_at DESC
      `,
      [req.user.id]
    );
    return res.json(rows.map(mapAppraisalRow));
  } catch (error) {
    return next(error);
  }
};

const listMyReviewList = async (req, res, next) => {
  try {
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
      ORDER BY a.created_at DESC
      `,
      [req.user.id]
    );
    return res.json(rows.map(mapAppraisalRow));
  } catch (error) {
    return next(error);
  }
};

const listMyAcceptList = async (req, res, next) => {
  try {
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
      WHERE a.ao_id = $1 AND a.status IN ('revo_rated', 'ao_accepted', 'completed')
      ORDER BY a.created_at DESC
      `,
      [req.user.id]
    );
    return res.json(rows.map(mapAppraisalRow));
  } catch (error) {
    return next(error);
  }
};

const getSummary = async (req, res, next) => {
  try {
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
      WHERE a.id = $1
      LIMIT 1
      `,
      [req.params.id]
    );
    const appraisal = rows[0];
    if (!appraisal) return res.status(404).json({ error: "Review not found" });

    const role = normalizeRole(req.user.role);
    const userId = req.user.id;
    const allowed =
      roleMatches(role, ROLES.HR_ADMIN) ||
      (roleMatches(role, ROLES.EMPLOYEE) && appraisal.employee_id === userId) ||
      (roleMatches(role, ROLES.REPORTING_OFFICER) && appraisal.ro_id === userId) ||
      (roleMatches(role, ROLES.REVIEWING_OFFICER) && appraisal.revo_id === userId) ||
      (roleMatches(role, ROLES.ACCEPTING_OFFICER) && appraisal.ao_id === userId);
    if (!allowed) return res.status(403).json({ error: "This appraisal is not assigned to you" });

    return res.json(mapAppraisalRow(appraisal));
  } catch (error) {
    return next(error);
  }
};

export { listMine, listMyTeam, listMyReviewList, listMyAcceptList, getSummary };
