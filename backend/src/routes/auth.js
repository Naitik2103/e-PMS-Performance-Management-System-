import express from "express";
import { login, logout, me, myAssignedEmployees, selectRole, switchRole } from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import { loginValidation } from "../validation/authValidation.js";
import { validate } from "../middleware/validate.js";

const router = express.Router();

router.post("/login", loginValidation, validate, login);
router.post("/forgot-password", (req, res) => {
  return res.json({ message: "If the account exists, a reset flow has been initiated." });
});
router.get("/me", protect, me);
router.get("/my-assigned-employees", protect, myAssignedEmployees);
router.post("/select-role", protect, selectRole);
router.post("/switch-role", protect, switchRole);
router.post("/logout", protect, logout);

export default router;
