import jwt from "jsonwebtoken";
import { User } from "../models.js";
import { normalizeRole } from "../constants/rbac.js";

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader) {
      return res.status(401).json({ error: "No token provided" });
    }

    const isBearer = authHeader.startsWith("Bearer ");
    if (!isBearer) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const token = authHeader.slice(7);
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Token expired, please log in again" });
      }
      return res.status(401).json({ error: "Invalid token" });
    }

    if (!decoded?.id && !decoded?.userId) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const userId = decoded.userId || decoded.id;
    const user = await User.findByPk(userId, { attributes: ["id", "email", "role", "isActive"] });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Invalid token" });
    }

    req.user = {
      userId: user.id,
      id: user.id,
      role: normalizeRole(decoded.role || user.role),
      email: decoded.email || user.email
    };
    return next();
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

export { authenticate };
