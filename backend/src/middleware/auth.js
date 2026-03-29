const jwt = require("jsonwebtoken");
const { User, AuthSession } = require("../models");

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401);
    return next(new Error("Not authorized, token missing"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.jti) {
      res.status(401);
      return next(new Error("Not authorized, session token invalid"));
    }
    const session = await AuthSession.findOne({ where: { tokenId: decoded.jti, userId: decoded.id, isRevoked: false } });
    if (!session || new Date(session.expiresAt) < new Date()) {
      res.status(401);
      return next(new Error("Not authorized, session expired"));
    }
    const user = await User.findByPk(decoded.id, { attributes: { exclude: ["passwordHash"] } });
    if (!user) {
      res.status(401);
      return next(new Error("Not authorized, user not found"));
    }
    req.user = user;
    return next();
  } catch (error) {
    res.status(401);
    return next(new Error("Not authorized, token invalid"));
  }
};

module.exports = { protect };
