const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    res.status(403);
    return next(new Error("Access denied"));
  }
  return next();
};

module.exports = { allowRoles };
