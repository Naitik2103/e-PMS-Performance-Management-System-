import jwt from "jsonwebtoken";
import crypto from "crypto";
import { ROLES, normalizeRole } from "../constants/rbac.js";
import pool from "../config/db.js";
import bcrypt from "bcryptjs";
import { OTP_PURPOSES, createOtpForUser, verifyOtpForUser, consumeOtp } from "../services/otpService.js";
import { sendOtpEmail } from "../services/emailService.js";

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

const getAvailableRolesForActiveCycle = async (userId, primaryRole) => {
  const normalizedPrimary = normalizeRole(primaryRole);
  if (normalizedPrimary === ROLES.HR_ADMIN) return [ROLES.HR_ADMIN];

  const available = new Set([ROLES.EMPLOYEE]);
  const assignments = await pool.query(
    `
    SELECT
      EXISTS (SELECT 1 FROM users WHERE is_active = true AND ro_id = $1) AS has_ro_assignees,
      EXISTS (SELECT 1 FROM users WHERE is_active = true AND rew_id = $1) AS has_revo_assignees,
      EXISTS (SELECT 1 FROM users WHERE is_active = true AND ao_id = $1) AS has_ao_assignees
    `,
    [userId]
  );

  const row = assignments.rows[0] || {};
  if (row.has_ro_assignees) available.add(ROLES.REPORTING_OFFICER);
  if (row.has_revo_assignees) available.add(ROLES.REVIEWING_OFFICER);
  if (row.has_ao_assignees) available.add(ROLES.ACCEPTING_OFFICER);

  return Array.from(available);
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
  reportingTo: user.ro_id,
  emailVerified: user.email_verified !== false
});

const getUserByEmail = async (email) => {
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
      u.is_active,
      COALESCE(u.email_verified, true) AS email_verified
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE u.is_active = true AND LOWER(u.email) = $1
    LIMIT 1
    `,
    [String(email || "").trim().toLowerCase()]
  );
  return rows[0] || null;
};

const login = async (req, res, next) => {
  try {
    const { email, employee_id: employeeId, password } = req.body;
    const user = await getUserByEmail(email || employeeId);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.email_verified === false) {
      return res.status(403).json({
        error: "Email is not verified. Please verify your email to continue.",
        code: "EMAIL_NOT_VERIFIED",
        email: user.email
      });
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

const requestPasswordResetOtp = async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await getUserByEmail(email);
    if (user) {
      const otp = await createOtpForUser({ userId: user.user_id, purpose: OTP_PURPOSES.PASSWORD_RESET, ttlMinutes: 10 });
      await sendOtpEmail({ to: user.email, otp, purpose: OTP_PURPOSES.PASSWORD_RESET });
      if (process.env.NODE_ENV !== "production") {
        return res.json({ message: "If the account exists, a reset OTP has been sent.", devOtp: otp });
      }
    }

    return res.json({ message: "If the account exists, a reset OTP has been sent." });
  } catch (error) {
    return next(error);
  }
};

const verifyPasswordResetOtp = async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();
    if (!email || !otp) return res.status(400).json({ error: "Email and OTP are required" });

    const user = await getUserByEmail(email);
    if (!user) return res.status(400).json({ error: "Invalid OTP" });

    const verified = await verifyOtpForUser({ userId: user.user_id, purpose: OTP_PURPOSES.PASSWORD_RESET, otp });
    if (!verified.ok) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    return res.json({ message: "OTP verified" });
  } catch (error) {
    return next(error);
  }
};

const resetPasswordWithOtp = async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();
    const newPassword = String(req.body?.newPassword || "");

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: "Email, OTP and new password are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const user = await getUserByEmail(email);
    if (!user) return res.status(400).json({ error: "Invalid request" });

    const verified = await verifyOtpForUser({ userId: user.user_id, purpose: OTP_PURPOSES.PASSWORD_RESET, otp });
    if (!verified.ok) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2",
      [hash, user.user_id]
    );
    await consumeOtp(verified.otpId);

    return res.json({ message: "Password reset successful" });
  } catch (error) {
    return next(error);
  }
};

const resendEmailVerificationOtp = async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await getUserByEmail(email);
    if (user && user.email_verified === false) {
      const otp = await createOtpForUser({ userId: user.user_id, purpose: OTP_PURPOSES.EMAIL_VERIFICATION, ttlMinutes: 10 });
      await sendOtpEmail({ to: user.email, otp, purpose: OTP_PURPOSES.EMAIL_VERIFICATION });
      if (process.env.NODE_ENV !== "production") {
        return res.json({ message: "Verification OTP sent", devOtp: otp });
      }
    }

    return res.json({ message: "If the account exists and is unverified, a verification OTP has been sent." });
  } catch (error) {
    return next(error);
  }
};

const verifyEmailOtp = async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();
    if (!email || !otp) return res.status(400).json({ error: "Email and OTP are required" });

    const user = await getUserByEmail(email);
    if (!user) return res.status(400).json({ error: "Invalid OTP" });
    if (user.email_verified === true) return res.json({ message: "Email already verified" });

    const verified = await verifyOtpForUser({ userId: user.user_id, purpose: OTP_PURPOSES.EMAIL_VERIFICATION, otp });
    if (!verified.ok) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    await pool.query("UPDATE users SET email_verified = true, updated_at = NOW() WHERE user_id = $1", [user.user_id]);
    await consumeOtp(verified.otpId);

    return res.json({ message: "Email verified successfully" });
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
  } catch {
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
        u.is_active,
        COALESCE(u.email_verified, true) AS email_verified
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
        u.is_active,
        COALESCE(u.email_verified, true) AS email_verified
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
        u.is_active,
        COALESCE(u.email_verified, true) AS email_verified
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

export {
  login,
  logout,
  me,
  selectRole,
  switchRole,
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  resetPasswordWithOtp,
  resendEmailVerificationOtp,
  verifyEmailOtp
};
