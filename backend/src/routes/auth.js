import express from "express";
import {
  login,
  logout,
  me,
  myAssignedEmployees,
  selectRole,
  switchRole,
  getActiveCycle,
  forgotPasswordRequest,
  resetForgotPassword
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
router.post("/forgot-password", forgotPasswordRequest);
router.post("/reset-password", resetForgotPassword);
router.get("/me", protect, me);
router.get("/my-assigned-employees", protect, myAssignedEmployees);
router.get("/active-cycle", protect, getActiveCycle);
router.post("/select-role", protect, selectRole);
router.post("/switch-role", protect, switchRole);
router.post("/logout", protect, logout);

export default router;
