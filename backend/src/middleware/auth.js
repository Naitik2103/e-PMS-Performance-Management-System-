const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401);
    return next(new Error("Not authorized, token missing"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-passwordHash");
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
