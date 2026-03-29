const express = require("express");
const { login, logout, me } = require("../controllers/authController");
const { loginValidation } = require("../validation/authValidation");
const { validate } = require("../middleware/validate");
const { protect } = require("../middleware/auth");

const router = express.Router();

router.post("/login", loginValidation, validate, login);
router.get("/me", protect, me);
router.post("/logout", protect, logout);

module.exports = router;
