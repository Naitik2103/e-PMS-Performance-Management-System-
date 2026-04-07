import { anyRoleMatches } from "../constants/rbac.js";

const authorise = (allowedRoles = []) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "No token provided" });
  }

  if (!anyRoleMatches(req.user.role, allowedRoles)) {
    return res.status(403).json({ error: "You do not have permission to perform this action" });
  }

  return next();
};

export { authorise };
