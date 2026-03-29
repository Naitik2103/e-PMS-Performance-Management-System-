const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { User, AuthSession } = require("../models");
const { writeAudit } = require("../services/auditService");

const tokenTtlMs = Number(process.env.JWT_EXPIRES_MS || 24 * 60 * 60 * 1000);

const generateToken = (id, tokenId) =>
  jwt.sign({ id, jti: tokenId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d"
  });

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email: email.toLowerCase(), isActive: true } });
    if (!user || !(await user.matchPassword(password))) {
      res.status(401);
      return next(new Error("Invalid credentials"));
    }

    const tokenId = crypto.randomUUID();
    const token = generateToken(user.id, tokenId);

    await AuthSession.create({
      userId: user.id,
      tokenId,
      expiresAt: new Date(Date.now() + tokenTtlMs)
    });

    await writeAudit({ user, action: "login", entity: "auth", entityId: user.id });

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
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

module.exports = { login, logout, me };
