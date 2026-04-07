import jwt from "jsonwebtoken";
import crypto from "crypto";
import { User, AuthSession } from "../models.js";
import { writeAudit } from "../services/auditService.js";
import { normalizeRole } from "../constants/rbac.js";
import { Op } from "sequelize";

const tokenTtlMs = Number(process.env.JWT_EXPIRES_MS || 8 * 60 * 60 * 1000);

const generateToken = (user, tokenId) =>
  jwt.sign({ userId: user.id, id: user.id, role: normalizeRole(user.role), email: user.email, jti: tokenId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h"
  });

const login = async (req, res, next) => {
  try {
    const { email, employee_id: employeeId, password } = req.body;
    const emailValue = (email || employeeId || "").toLowerCase();
    const user = await User.findOne({
      where: {
        isActive: true,
        [Op.or]: [{ email: emailValue }, { name: emailValue }]
      }
    });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const tokenId = crypto.randomUUID();
    const token = generateToken(user, tokenId);

    await AuthSession.create({
      userId: user.id,
      tokenId,
      expiresAt: new Date(Date.now() + tokenTtlMs)
    });

    await writeAudit({ user, action: "user_login", entity: "auth", entityId: user.id });

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: normalizeRole(user.role),
        department: user.department,
        reportingTo: user.reportingTo
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
      await AuthSession.update(
        { isRevoked: true, revokedAt: new Date() },
        { where: { tokenId: decoded.jti, userId: decoded.id } }
      );
    }
    await writeAudit({ user: req.user, action: "logout", entity: "auth", entityId: req.user?.id || null });
    return res.json({ message: "Logged out" });
  } catch (error) {
    return res.json({ message: "Logged out" });
  }
};

const me = async (req, res) => {
  res.json({ user: req.user });
};

export { login, logout, me };
