import express from "express";
import {
  createGoal,
  updateGoal,
  deleteGoal,
  submitCycleGoals,
  listMyGoals,
  listAllGoals,
  listGoalsForRO,
  listGoalsForReviewing,
  approveGoalByRO,
  approveGoalByReviewing
} from "../controllers/goalController.js";
import { goalValidation, submitValidation } from "../validation/goalValidation.js";
import { validate } from "../middleware/validate.js";
import { protect } from "../middleware/auth.js";
import { authorizeRoles } from "../middleware/roles.js";
import { ROLES } from "../constants/rbac.js";

const router = express.Router();

router.get("/my", protect, authorizeRoles(ROLES.EMPLOYEE), listMyGoals);
router.get("/all", protect, authorizeRoles(ROLES.HR_ADMIN), listAllGoals);
router.post("/", protect, authorizeRoles(ROLES.EMPLOYEE), goalValidation, validate, createGoal);
router.put("/:id", protect, authorizeRoles(ROLES.EMPLOYEE), goalValidation, validate, updateGoal);
router.delete("/:id", protect, authorizeRoles(ROLES.EMPLOYEE), deleteGoal);
router.post("/submit", protect, authorizeRoles(ROLES.EMPLOYEE), submitValidation, validate, submitCycleGoals);

router.get("/pending/ro", protect, authorizeRoles(ROLES.REPORTING_OFFICER), listGoalsForRO);
router.get("/pending/review", protect, authorizeRoles(ROLES.REVIEWING_OFFICER), listGoalsForReviewing);
router.post("/:id/approve/ro", protect, authorizeRoles(ROLES.REPORTING_OFFICER), approveGoalByRO);
router.post("/:id/approve/review", protect, authorizeRoles(ROLES.REVIEWING_OFFICER), approveGoalByReviewing);

export default router;
