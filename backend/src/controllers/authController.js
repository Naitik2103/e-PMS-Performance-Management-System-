const jwt = require("jsonwebtoken");
const { User } = require("../models");

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d"
  });

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email: email.toLowerCase() } });
    if (!user || !(await user.matchPassword(password))) {
      res.status(401);
      return next(new Error("Invalid credentials"));
    }

    const token = generateToken(user.id);
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

const me = async (req, res) => {
  res.json({ user: req.user });
};

module.exports = { login, me };
