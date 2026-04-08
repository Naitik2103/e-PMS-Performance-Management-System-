import jwt from "jsonwebtoken";
import crypto from "crypto";
import { ROLES, normalizeRole } from "../constants/rbac.js";
import pool from "../config/db.js";
import bcrypt from "bcryptjs";

const tokenTtlMs = Number(process.env.JWT_EXPIRES_MS || 8 * 60 * 60 * 1000);

const generateToken = (user, tokenId, activeRole) =>
  jwt.sign({ userId: user.user_id, id: user.user_id, role: normalizeRole(activeRole || user.role), email: user.email, jti: tokenId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h"
  });

const getAvailableRoles = async (user) => {
  const normalizedPrimary = normalizeRole(user.role);
  const roles = new Set();

  // Employee should be shown only if the user can act as employee (default for most users).
  if (normalizedPrimary === ROLES.EMPLOYEE || normalizedPrimary === ROLES.HR_ADMIN) {
    roles.add(ROLES.EMPLOYEE);
  }

  if (normalizedPrimary === ROLES.HR_ADMIN) {
    roles.add(ROLES.HR_ADMIN);
  }

  const [roReportCount, reviewingAssigneeCount, acceptingAssigneeCount] = await Promise.all([
    pool.query("SELECT COUNT(1)::int AS c FROM users WHERE is_active = true AND ro_id = $1", [user.user_id]),
    pool.query("SELECT COUNT(1)::int AS c FROM users WHERE is_active = true AND rew_id = $1", [user.user_id]),
    pool.query("SELECT COUNT(1)::int AS c FROM users WHERE is_active = true AND ao_id = $1", [user.user_id])
  ]);

  if (normalizedPrimary === ROLES.REPORTING_OFFICER || roReportCount.rows?.[0]?.c > 0) roles.add(ROLES.REPORTING_OFFICER);
  if (normalizedPrimary === ROLES.REVIEWING_OFFICER || reviewingAssigneeCount.rows?.[0]?.c > 0) roles.add(ROLES.REVIEWING_OFFICER);
  if (normalizedPrimary === ROLES.ACCEPTING_OFFICER || acceptingAssigneeCount.rows?.[0]?.c > 0) roles.add(ROLES.ACCEPTING_OFFICER);

  // If user is not employee/admin, still allow their primary role at minimum.
  if (!roles.size) roles.add(normalizedPrimary);

  return Array.from(roles);
};

const login = async (req, res, next) => {
  try {
    const { email, employee_id: employeeId, password } = req.body;
    const emailValue = (email || employeeId || "").toLowerCase();
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
        u.department_id,
        d.name AS department,
        u.password_hash,
        u.is_active
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.is_active = true AND LOWER(u.email) = $1
      LIMIT 1
      `,
      [emailValue]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const availableRoles = await getAvailableRoles(user);
    const primary = normalizeRole(user.role);
    const defaultRole = availableRoles.includes(primary) ? primary : availableRoles[0];
    const tokenId = crypto.randomUUID();
    const token = generateToken(user, tokenId, defaultRole);

    await pool.query("INSERT INTO auth_sessions (user_id, token_id, expires_at) VALUES ($1, $2, $3)", [
      user.user_id,
      tokenId,
      new Date(Date.now() + tokenTtlMs)
    ]);

    return res.json({
      token,
      user: {
        id: user.user_id,
        name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email,
        email: user.email,
        role: defaultRole,
        availableRoles,
        department: user.department,
        reportingTo: user.ro_id
      }
    });
  } catch (error) {
    return next(error);
  }
};

const logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.json({ message: "Logged out" });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded?.jti) {
      await pool.query("UPDATE auth_sessions SET is_revoked = true, revoked_at = NOW() WHERE token_id = $1 AND user_id = $2", [
        decoded.jti,
        decoded.id
      ]);
    }
    return res.json({ message: "Logged out" });
  } catch (error) {
    return res.json({ message: "Logged out" });
  }
};

const me = async (req, res, next) => {
  try {
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
        d.name AS department,
        u.is_active
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.user_id = $1
      LIMIT 1
      `,
      [req.user.id]
    );
    const dbUser = rows[0];
    if (!dbUser || !dbUser.is_active) {
      return res.status(401).json({ error: "Invalid token" });
    }
    const availableRoles = await getAvailableRoles(dbUser);
    return res.json({
      user: {
        id: dbUser.user_id,
        userId: dbUser.user_id,
        name: `${dbUser.first_name || ""} ${dbUser.last_name || ""}`.trim() || dbUser.email,
        email: dbUser.email,
        role: normalizeRole(req.user.role || dbUser.role),
        availableRoles,
        department: dbUser.department,
        reportingTo: dbUser.ro_id
      }
    });
  } catch (error) {
    return next(error);
  }
};

const selectRole = async (req, res, next) => {
  try {
    const requestedRole = normalizeRole(req.body?.role);
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
        d.name AS department,
        u.is_active
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.user_id = $1
      LIMIT 1
      `,
      [req.user.id]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const availableRoles = await getAvailableRoles(user);
    if (!availableRoles.includes(requestedRole)) {
      return res.status(403).json({ error: "You do not have permission to use this role" });
    }

    const tokenId = crypto.randomUUID();
    const token = generateToken(user, tokenId, requestedRole);
    await pool.query("INSERT INTO auth_sessions (user_id, token_id, expires_at) VALUES ($1, $2, $3)", [
      user.user_id,
      tokenId,
      new Date(Date.now() + tokenTtlMs)
    ]);

    return res.json({
      token,
      user: {
        id: user.user_id,
        name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email,
        email: user.email,
        role: requestedRole,
        availableRoles,
        department: user.department,
        reportingTo: user.ro_id
      }
    });
  } catch (error) {
    return next(error);
  }
};

export { login, logout, me, selectRole };
