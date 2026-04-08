import jwt from "jsonwebtoken";
import { normalizeRole } from "../constants/rbac.js";
import pool from "../config/db.js";

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
    const { rows } = await pool.query(
      "SELECT user_id, email, role, is_active FROM users WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: "Invalid token" });
    }

    req.user = {
      userId: user.user_id,
      id: user.user_id,
      role: normalizeRole(decoded.role || user.role),
      email: decoded.email || user.email
    };
    return next();
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

export { authenticate };
