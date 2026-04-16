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

const getActiveCycleId = async () => {
  const { rows } = await pool.query(
    "SELECT cycle_id FROM appraisal_cycles WHERE status = 'active' ORDER BY activated_at DESC NULLS LAST, created_at DESC LIMIT 1"
  );
  return rows[0]?.cycle_id || null;
};

const getActiveCycleWithDates = async () => {
  const { rows } = await pool.query(
    `
    SELECT
      cycle_id,
      cycle_year AS year,
      cycle_name AS name,
      goal_setting_start AS "goalSettingStart",
      goal_setting_end AS "goalSettingEnd",
      six_month_progress_review_start AS "sixMonthProgressReviewStart",
      six_month_progress_review_end AS "sixMonthProgressReviewEnd",
      annual_appraisal_start AS "annualAppraisalStart",
      annual_appraisal_end AS "annualAppraisalEnd",
      (goal_setting_start IS NOT NULL AND goal_setting_end IS NOT NULL AND CURRENT_DATE BETWEEN goal_setting_start AND goal_setting_end) AS "isGoalSettingActive",
      (six_month_progress_review_start IS NOT NULL AND six_month_progress_review_end IS NOT NULL AND CURRENT_DATE BETWEEN six_month_progress_review_start AND six_month_progress_review_end) AS "isSixMonthReviewActive",
      (annual_appraisal_start IS NOT NULL AND annual_appraisal_end IS NOT NULL AND CURRENT_DATE BETWEEN annual_appraisal_start AND annual_appraisal_end) AS "isAnnualAppraisalActive",
      CURRENT_DATE AS "serverDate",
      status,
      created_at AS "createdAt",
      activated_at AS "activatedAt"
    FROM appraisal_cycles
    WHERE status = 'active'
    ORDER BY
      CASE WHEN CURRENT_DATE BETWEEN goal_setting_start AND goal_setting_end THEN 0 ELSE 1 END,
      activated_at DESC NULLS LAST,
      created_at DESC
    LIMIT 1
    `
  );
  return rows[0] || null;
};

const getAvailableRolesForActiveCycle = async (userId, primaryRole) => {
  const normalizedPrimary = normalizeRole(primaryRole);
  if (normalizedPrimary === ROLES.HR_ADMIN) return [ROLES.HR_ADMIN];

  const available = new Set([ROLES.EMPLOYEE]);
  if (normalizedPrimary && normalizedPrimary !== ROLES.EMPLOYEE) {
    available.add(normalizedPrimary);
  }

  const activeCycleId = await getActiveCycleId();
  if (!activeCycleId) {
    return Array.from(available);
  }

  const assignments = await pool.query(
    `
    SELECT
      COALESCE(bool_or(reporting_officer_id = $1), false) AS has_ro_assignees,
      COALESCE(bool_or(reviewing_officer_id = $1), false) AS has_revo_assignees,
      COALESCE(bool_or(accepting_officer_id = $1), false) AS has_ao_assignees
    FROM appraisal_cycle_participants
    WHERE cycle_id = $2
      AND ($1 = reporting_officer_id OR $1 = reviewing_officer_id OR $1 = accepting_officer_id)
    `,
    [userId, activeCycleId]
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

const myAssignedEmployees = async (req, res, next) => {
  try {
    const activeCycleId = await getActiveCycleId();
    const activeRole = normalizeRole(req.user.selectedRole || req.user.role);
    if (!activeCycleId) {
      return res.json({
        cycleId: null,
        mode: activeRole,
        officers: {
          reportingOfficer: null,
          reviewingOfficer: null,
          acceptingOfficer: null
        },
        employees: []
      });
    }

    if (activeRole === ROLES.EMPLOYEE) {
      const { rows } = await pool.query(
        `
        SELECT
          p.reporting_officer_id AS "reportingOfficerId",
          COALESCE(NULLIF(TRIM(ro.full_name), ''), CONCAT_WS(' ', ro.first_name, ro.last_name), ro.email) AS "reportingOfficerName",
          p.reviewing_officer_id AS "reviewingOfficerId",
          COALESCE(NULLIF(TRIM(revo.full_name), ''), CONCAT_WS(' ', revo.first_name, revo.last_name), revo.email) AS "reviewingOfficerName",
          p.accepting_officer_id AS "acceptingOfficerId",
          COALESCE(NULLIF(TRIM(ao.full_name), ''), CONCAT_WS(' ', ao.first_name, ao.last_name), ao.email) AS "acceptingOfficerName"
        FROM appraisal_cycle_participants p
        LEFT JOIN users ro ON ro.user_id = p.reporting_officer_id
        LEFT JOIN users revo ON revo.user_id = p.reviewing_officer_id
        LEFT JOIN users ao ON ao.user_id = p.accepting_officer_id
        WHERE p.cycle_id = $1 AND p.employee_id = $2
        LIMIT 1
        `,
        [activeCycleId, req.user.id]
      );

      const row = rows[0] || {};
      return res.json({
        cycleId: activeCycleId,
        mode: ROLES.EMPLOYEE,
        officers: {
          reportingOfficer: row.reportingOfficerId
            ? { id: row.reportingOfficerId, name: row.reportingOfficerName }
            : null,
          reviewingOfficer: row.reviewingOfficerId
            ? { id: row.reviewingOfficerId, name: row.reviewingOfficerName }
            : null,
          acceptingOfficer: row.acceptingOfficerId
            ? { id: row.acceptingOfficerId, name: row.acceptingOfficerName }
            : null
        },
        employees: []
      });
    }

    const roleColumnMap = {
      [ROLES.REPORTING_OFFICER]: "reporting_officer_id",
      [ROLES.REVIEWING_OFFICER]: "reviewing_officer_id",
      [ROLES.ACCEPTING_OFFICER]: "accepting_officer_id"
    };

    const column = roleColumnMap[activeRole];
    if (!column) {
      return res.json({
        cycleId: activeCycleId,
        mode: activeRole,
        officers: {
          reportingOfficer: null,
          reviewingOfficer: null,
          acceptingOfficer: null
        },
        employees: []
      });
    }

    const { rows } = await pool.query(
      `
      SELECT
        p.employee_id AS "employeeId",
        COALESCE(NULLIF(TRIM(u.full_name), ''), CONCAT_WS(' ', u.first_name, u.last_name), u.email) AS "employeeName",
        u.employee_id AS "employeeCode",
        d.name AS department,
        des.title AS designation
      FROM appraisal_cycle_participants p
      JOIN users u ON u.user_id = p.employee_id
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN designations des ON des.id = u.designation_id
      WHERE p.cycle_id = $2
        AND p.${column} = $1
      ORDER BY "employeeName" ASC
      `,
      [req.user.id, activeCycleId]
    );

    return res.json({
      cycleId: activeCycleId,
      mode: activeRole,
      officers: {
        reportingOfficer: null,
        reviewingOfficer: null,
        acceptingOfficer: null
      },
      employees: rows.map((row) => ({
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        employeeCode: row.employeeCode,
        department: row.department,
        designation: row.designation
      }))
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

const getActiveCycle = async (req, res, next) => {
  try {
    const cycle = await getActiveCycleWithDates();
    if (!cycle) {
      return res.json(null);
    }
    
    // Return date strings as-is from database (YYYY-MM-DD format)
    // Do NOT convert to ISO strings to avoid timezone issues
    const cycleDates = {
      cycleId: cycle.cycle_id,
      year: cycle.year,
      name: cycle.name,
      status: cycle.status,
      goalSettingStart: cycle.goalSettingStart,
      goalSettingEnd: cycle.goalSettingEnd,
      sixMonthProgressReviewStart: cycle.sixMonthProgressReviewStart,
      sixMonthProgressReviewEnd: cycle.sixMonthProgressReviewEnd,
      annualAppraisalStart: cycle.annualAppraisalStart,
      annualAppraisalEnd: cycle.annualAppraisalEnd,
      isGoalSettingActive: cycle.isGoalSettingActive,
      isSixMonthReviewActive: cycle.isSixMonthReviewActive,
      isAnnualAppraisalActive: cycle.isAnnualAppraisalActive,
      serverDate: cycle.serverDate,
      createdAt: cycle.createdAt,
      activatedAt: cycle.activatedAt
    };
    
    return res.json(cycleDates);
  } catch (error) {
    return next(error);
  }
};

export {
  login,
  logout,
  me,
  myAssignedEmployees,
  selectRole,
  switchRole,
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  resetPasswordWithOtp,
  resendEmailVerificationOtp,
  verifyEmailOtp,
  getActiveCycle
};
