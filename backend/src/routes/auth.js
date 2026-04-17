import express from "express";
import {
  login,
  logout,
  me,
  myAssignedEmployees,
  selectRole,
  switchRole,
  getActiveCycle,
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  resetPasswordWithOtp
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import {
  loginValidation,
  forgotPasswordRequestValidation,
  forgotPasswordVerifyValidation,
  forgotPasswordResetValidation
} from "../validation/authValidation.js";
import { validate } from "../middleware/validate.js";

const router = express.Router();

router.post("/login", loginValidation, validate, login);
router.post("/forgot-password/request", forgotPasswordRequestValidation, validate, requestPasswordResetOtp);
router.post("/forgot-password/verify", forgotPasswordVerifyValidation, validate, verifyPasswordResetOtp);
router.post("/forgot-password/reset", forgotPasswordResetValidation, validate, resetPasswordWithOtp);
router.get("/me", protect, me);
router.get("/my-assigned-employees", protect, myAssignedEmployees);
router.get("/active-cycle", protect, getActiveCycle);
router.post("/select-role", protect, selectRole);
router.post("/switch-role", protect, switchRole);
router.post("/logout", protect, logout);

export default router;
