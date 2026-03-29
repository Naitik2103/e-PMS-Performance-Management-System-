const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    res.status(403);
    return next(new Error("Access denied"));
  }
  return next();
};

const authorizeRoles = (...roles) => allowRoles(...roles);

module.exports = { allowRoles, authorizeRoles };
