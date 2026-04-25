import bcrypt from "bcryptjs";
import pool from "../config/db.js";
import { ROLES, normalizeRole } from "../constants/rbac.js";

const displayNameFromParts = (firstName, lastName, email) => {
  const name = `${(firstName || "").trim()} ${(lastName || "").trim()}`.trim();
  return name || email;
};

const ensureDepartmentId = async (departmentName) => {
  const name = (departmentName || "").trim();
  if (!name) return null;
  const existing = await pool.query("SELECT id FROM departments WHERE name = $1 LIMIT 1", [name]);
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 10) || "DEPT";
  const created = await pool.query(
    "INSERT INTO departments (name, code, is_active) VALUES ($1, $2, true) RETURNING id",
    [name, code]
  );
  return created.rows[0].id;
};

const createUser = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, password, role, department, reportingTo, reviewingOfficerId, acceptingOfficerId } = req.body;
    const emailValue = (email || "").toLowerCase();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(emailValue)) {
      res.status(400);
      return next(new Error("Invalid email format"));
    }
    const phoneValue = phone ? String(phone).trim() : null;

    const exists = await pool.query("SELECT 1 FROM users WHERE LOWER(email) = $1 LIMIT 1", [emailValue]);
    if (exists.rows.length) {
      res.status(409);
      return next(new Error("User with this email already exists"));
    }

    if (phoneValue) {
      const phoneExists = await pool.query("SELECT 1 FROM users WHERE phone = $1 LIMIT 1", [phoneValue]);
      if (phoneExists.rows.length) {
        res.status(409);
        return next(new Error("User with this phone number already exists"));
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const departmentId = await ensureDepartmentId(department);
    const normalizedRole = normalizeRole(role || ROLES.EMPLOYEE);

    const inserted = await pool.query(
      `
      INSERT INTO users
        (first_name, last_name, email, phone, password_hash, role, department_id, ro_id, rew_id, ao_id, is_active)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
      RETURNING user_id, first_name, last_name, email, phone, role, ro_id, rew_id, ao_id, department_id, is_active
      `,
      [
        (firstName || "").trim() || null,
        (lastName || "").trim() || null,
        emailValue,
        phoneValue,
        passwordHash,
        normalizedRole,
        departmentId,
        reportingTo || null,
        reviewingOfficerId || null,
        acceptingOfficerId || null
      ]
    );

    const row = inserted.rows[0];
    const dept = departmentId
      ? await pool.query("SELECT name FROM departments WHERE id = $1 LIMIT 1", [departmentId])
      : { rows: [] };

    return res.status(201).json({
      id: row.user_id,
      name: displayNameFromParts(row.first_name, row.last_name, row.email),
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      department: dept.rows[0]?.name || department || null,
      reportingTo: row.ro_id,
      reviewingOfficerId: row.rew_id,
      acceptingOfficerId: row.ao_id,
      isActive: row.is_active
    });
  } catch (error) {
    return next(error);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const role = req.query.role ? normalizeRole(req.query.role) : null;
    const { rows } = await pool.query(
      `
      SELECT
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        u.ro_id,
        u.rew_id,
        u.ao_id,
        u.is_active,
        u.phone,
        d.name AS department
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE ($1::text IS NULL OR u.role = $1)
      ORDER BY u.created_at DESC
      `,
      [role]
    );

    return res.json(
      rows.map((u) => ({
        id: u.user_id,
        name: displayNameFromParts(u.first_name, u.last_name, u.email),
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        role: u.role,
        department: u.department,
        reportingTo: u.ro_id,
        reviewingOfficerId: u.rew_id,
        acceptingOfficerId: u.ao_id,
        isActive: u.is_active,
        phone: u.phone
      }))
    );
  } catch (error) {
    return next(error);
  }
};

const listDepartments = async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT name FROM departments WHERE is_active = true ORDER BY name ASC");
    return res.json(rows.map((r) => r.name));
  } catch (error) {
    return next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const id = req.params.id;

    const existing = await pool.query(
      `
      SELECT user_id, first_name, last_name, email, role, department_id, ro_id, rew_id, ao_id, is_active, phone
      FROM users
      WHERE user_id = $1
      LIMIT 1
      `,
      [id]
    );
    if (!existing.rows.length) {
      res.status(404);
      return next(new Error("User not found"));
    }

    const departmentId =
      req.body.department !== undefined ? await ensureDepartmentId(req.body.department) : existing.rows[0].department_id;

    const reportingTo = req.body.reportingTo !== undefined ? req.body.reportingTo || null : existing.rows[0].ro_id;
    const reviewingOfficerId =
      req.body.reviewingOfficerId !== undefined ? req.body.reviewingOfficerId || null : existing.rows[0].rew_id;
    const acceptingOfficerId =
      req.body.acceptingOfficerId !== undefined ? req.body.acceptingOfficerId || null : existing.rows[0].ao_id;

    const firstName = req.body.firstName !== undefined ? req.body.firstName : existing.rows[0].first_name;
    const lastName = req.body.lastName !== undefined ? req.body.lastName : existing.rows[0].last_name;
    const phone = req.body.phone !== undefined ? req.body.phone : existing.rows[0].phone;
    if (req.body.phone) {
      const phoneVal = String(req.body.phone).trim();
      if (phoneVal.length !== 10) {
        res.status(400);
        return next(new Error("Phone number must be exactly 10 digits"));
      }
      
      const phoneExists = await pool.query(
        "SELECT 1 FROM users WHERE phone = $1 AND user_id <> $2 LIMIT 1",
        [phoneVal, id]
      );
      if (phoneExists.rows.length) {
        res.status(409);
        return next(new Error("This phone number is already taken by another user"));
      }
    }

    const updated = await pool.query(
      `
      UPDATE users SET
        department_id = $2,
        ro_id = $3,
        rew_id = $4,
        ao_id = $5,
        first_name = $6,
        last_name = $7,
        phone = $8,
        updated_at = NOW()
      WHERE user_id = $1
      RETURNING user_id, first_name, last_name, email, role, department_id, ro_id, rew_id, ao_id, is_active, phone
      `,
      [id, departmentId, reportingTo, reviewingOfficerId, acceptingOfficerId, firstName, lastName, phone]
    );

    const row = updated.rows[0];
    const dept = row.department_id
      ? await pool.query("SELECT name FROM departments WHERE id = $1 LIMIT 1", [row.department_id])
      : { rows: [] };

    return res.json({
      id: row.user_id,
      name: displayNameFromParts(row.first_name, row.last_name, row.email),
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      role: row.role,
      department: dept.rows[0]?.name || null,
      reportingTo: row.ro_id,
      reviewingOfficerId: row.rew_id,
      acceptingOfficerId: row.ao_id,
      isActive: row.is_active
    });
  } catch (error) {
    return next(error);
  }
};

const hierarchy = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT user_id, first_name, last_name, email, role, ro_id, is_active
      FROM users
      WHERE is_active = true
      ORDER BY created_at ASC
      `
    );

    const nodesById = new Map();
    for (const u of rows) {
      nodesById.set(u.user_id, {
        id: u.user_id,
        name: displayNameFromParts(u.first_name, u.last_name, u.email),
        role: u.role,
        reports: []
      });
    }

    const roots = [];
    for (const u of rows) {
      const node = nodesById.get(u.user_id);
      const managerId = u.ro_id;
      const manager = managerId ? nodesById.get(managerId) : null;
      if (manager) manager.reports.push(node);
      else roots.push(node);
    }

    return res.json(roots);
  } catch (error) {
    return next(error);
  }
};

export { createUser, listUsers, updateUser, hierarchy, listDepartments };
