import express from "express";
import { login, logout, me, forgotPasswordRequest, resetForgotPassword } from "../controllers/authController.js";
import { loginValidation } from "../validation/authValidation.js";
import { validate } from "../middleware/validate.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.post("/login", loginValidation, validate, login);
router.post("/forgot-password", forgotPasswordRequest);
router.post("/reset-password", resetForgotPassword);
router.get("/me", protect, me);
router.post("/logout", protect, logout);

export default router;
