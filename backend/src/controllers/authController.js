import jwt from "jsonwebtoken";
import crypto from "crypto";
import { ROLES, normalizeRole } from "../constants/rbac.js";
import pool from "../config/db.js";
import bcrypt from "bcryptjs";

const tokenTtlMs = Number(process.env.JWT_EXPIRES_MS || 8 * 60 * 60 * 1000);
const preAuthTtlSec = Number(process.env.PREAUTH_EXPIRES_IN_SECONDS || 5 * 60);

const generateAuthToken = ({ user, tokenId, selectedRole, availableRoles }) =>
  jwt.sign(
    {
      userId: user.user_id,
      id: user.user_id,
      selectedRole: normalizeRole(selectedRole || user.role),
      role: normalizeRole(selectedRole || user.role),
      availableRoles: (availableRoles || []).map((r) => normalizeRole(r)),
      email: user.email,
      jti: tokenId
    },
    process.env.JWT_SECRET,
    {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h"
    }
  );

// Note: Pre-auth token support is retained for future use, but the current UX
// logs in as Employee by default and relies on in-session switching.
const generatePreAuthToken = ({ user, tokenId, availableRoles }) =>
  jwt.sign(
    {
      userId: user.user_id,
      id: user.user_id,
      stage: "preauth",
      availableRoles: (availableRoles || []).map((r) => normalizeRole(r)),
      email: user.email,
      jti: tokenId
    },
    process.env.JWT_SECRET,
    { expiresIn: preAuthTtlSec }
  );

const getActiveCycleId = async () => {
  const r = await pool.query("SELECT cycle_id FROM appraisal_cycles WHERE closed_at IS NULL ORDER BY created_at DESC LIMIT 1");
  return r.rows[0]?.cycle_id || null;
};

const getAvailableRolesForActiveCycle = async (userId, primaryRole) => {
  const roles = new Set([ROLES.EMPLOYEE]);
  const normalizedPrimary = normalizeRole(primaryRole);
  if (normalizedPrimary === ROLES.HR_ADMIN) return [ROLES.HR_ADMIN];

  const cycleId = await getActiveCycleId();
  if (!cycleId) {
    // No active cycle: still allow employee context so user can log in, but no officer contexts.
    return Array.from(roles);
  }

  const [ro, revo, ao] = await Promise.all([
    pool.query(
      "SELECT 1 FROM appraisal_cycle_participants WHERE cycle_id = $1 AND reporting_officer_id = $2 LIMIT 1",
      [cycleId, userId]
    ),
    pool.query(
      "SELECT 1 FROM appraisal_cycle_participants WHERE cycle_id = $1 AND reviewing_officer_id = $2 LIMIT 1",
      [cycleId, userId]
    ),
    pool.query(
      "SELECT 1 FROM appraisal_cycle_participants WHERE cycle_id = $1 AND accepting_officer_id = $2 LIMIT 1",
      [cycleId, userId]
    )
  ]);

  if (ro.rows.length) roles.add(ROLES.REPORTING_OFFICER);
  if (revo.rows.length) roles.add(ROLES.REVIEWING_OFFICER);
  if (ao.rows.length) roles.add(ROLES.ACCEPTING_OFFICER);

  // Always include their primary role if it's a known role (legacy DB values normalized).
  if (Object.values(ROLES).includes(normalizedPrimary)) roles.add(normalizedPrimary);

  return Array.from(roles);
};

const mapUserResponse = ({ user, selectedRole, availableRoles }) => ({
  id: user.user_id,
  userId: user.user_id,
  name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email,
  email: user.email,
  role: normalizeRole(selectedRole),
  selectedRole: normalizeRole(selectedRole),
  availableRoles: (availableRoles || []).map((r) => normalizeRole(r)),
  department: user.department,
  reportingTo: user.ro_id
});

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

    const primary = normalizeRole(user.role);
    if (primary === ROLES.HR_ADMIN) {
      const availableRoles = [ROLES.HR_ADMIN];
      const tokenId = crypto.randomUUID();
      const token = generateAuthToken({ user, tokenId, selectedRole: ROLES.HR_ADMIN, availableRoles });
      await pool.query("INSERT INTO auth_sessions (user_id, token_id, expires_at) VALUES ($1, $2, $3)", [
        user.user_id,
        tokenId,
        new Date(Date.now() + tokenTtlMs)
      ]);
      return res.json({ token, user: mapUserResponse({ user, selectedRole: ROLES.HR_ADMIN, availableRoles }) });
    }

    const availableRoles = await getAvailableRolesForActiveCycle(user.user_id, user.role);
    const tokenId = crypto.randomUUID();
    const token = generateAuthToken({ user, tokenId, selectedRole: ROLES.EMPLOYEE, availableRoles });
    await pool.query("INSERT INTO auth_sessions (user_id, token_id, expires_at) VALUES ($1, $2, $3)", [
      user.user_id,
      tokenId,
      new Date(Date.now() + tokenTtlMs)
    ]);
    return res.json({ token, user: mapUserResponse({ user, selectedRole: ROLES.EMPLOYEE, availableRoles }) });
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
    const availableRoles =
      normalizeRole(dbUser.role) === ROLES.HR_ADMIN
        ? [ROLES.HR_ADMIN]
        : await getAvailableRolesForActiveCycle(dbUser.user_id, dbUser.role);
    return res.json({
      user: {
        ...mapUserResponse({
          user: dbUser,
          selectedRole: req.user.selectedRole || req.user.role || dbUser.role,
          availableRoles
        })
      }
    });
  } catch (error) {
    return next(error);
  }
};

const selectRole = async (req, res, next) => {
  try {
    if (req.authClaims?.stage !== "preauth") {
      return res.status(401).json({ error: "Invalid token" });
    }
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

    const availableRoles = await getAvailableRolesForActiveCycle(user.user_id, user.role);
    if (!availableRoles.includes(requestedRole)) {
      return res.status(403).json({ error: "You do not have permission to use this role" });
    }

    const tokenId = crypto.randomUUID();
    const token = generateAuthToken({ user, tokenId, selectedRole: requestedRole, availableRoles });
    await pool.query("INSERT INTO auth_sessions (user_id, token_id, expires_at) VALUES ($1, $2, $3)", [
      user.user_id,
      tokenId,
      new Date(Date.now() + tokenTtlMs)
    ]);

    return res.json({
      token,
      user: mapUserResponse({ user, selectedRole: requestedRole, availableRoles })
    });
  } catch (error) {
    return next(error);
  }
};

const switchRole = async (req, res, next) => {
  try {
    if (req.authClaims?.stage === "preauth") {
      return res.status(401).json({ error: "Invalid token" });
    }
    const requestedRole = normalizeRole(req.body?.role);
    if (!requestedRole) return res.status(400).json({ error: "Role is required" });

    const { rows } = await pool.query(
      `
      SELECT
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        u.ro_id,
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

    const availableRoles = await getAvailableRolesForActiveCycle(user.user_id, user.role);
    if (!availableRoles.includes(requestedRole)) {
      return res.status(403).json({ error: "You do not have permission to use this role" });
    }

    const tokenId = crypto.randomUUID();
    const token = generateAuthToken({ user, tokenId, selectedRole: requestedRole, availableRoles });
    await pool.query("INSERT INTO auth_sessions (user_id, token_id, expires_at) VALUES ($1, $2, $3)", [
      user.user_id,
      tokenId,
      new Date(Date.now() + tokenTtlMs)
    ]);

    return res.json({ token, user: mapUserResponse({ user, selectedRole: requestedRole, availableRoles }) });
  } catch (error) {
    return next(error);
  }
};

export { login, logout, me, selectRole, switchRole };
