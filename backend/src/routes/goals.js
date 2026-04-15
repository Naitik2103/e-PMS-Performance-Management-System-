import express from "express";
import { protect } from "../middleware/auth.js";
import { authorise } from "../middleware/authorise.js";
import { ROLES } from "../constants/rbac.js";
import {
  listMyGoals,
  listAllGoals,
  listGoalsForRO,
  listGoalsForReviewing,
  createGoal,
  updateGoal,
  deleteGoal,
  submitCycleGoals,
  approveGoalByRO,
  approveGoalByReviewing,
  getGoalsByAppraisalId,
  updateGoalsByAppraisalId,
  submitGoalsByAppraisalId,
  approveGoalsByAppraisalId,
  sendbackGoalsByAppraisalId
} from "../controllers/goalController.js";

const router = express.Router();

// Compatibility endpoints used by current frontend.
router.get("/my", protect, authorise([ROLES.EMPLOYEE]), listMyGoals);
router.get("/all", protect, authorise([ROLES.HR_ADMIN]), listAllGoals);
router.post("/", protect, authorise([ROLES.EMPLOYEE]), createGoal);
router.put("/goal/:id", protect, authorise([ROLES.EMPLOYEE]), updateGoal);
router.delete("/:id", protect, authorise([ROLES.EMPLOYEE]), deleteGoal);
router.post("/submit", protect, authorise([ROLES.EMPLOYEE]), submitCycleGoals);
router.get("/pending/ro", protect, authorise([ROLES.REPORTING_OFFICER]), listGoalsForRO);
router.get("/pending/review", protect, authorise([ROLES.REVIEWING_OFFICER]), listGoalsForReviewing);
router.post("/:id/approve/ro", protect, authorise([ROLES.REPORTING_OFFICER]), approveGoalByRO);
router.post("/:id/approve/review", protect, authorise([ROLES.REVIEWING_OFFICER]), approveGoalByReviewing);

// Strict PRD appraisal-scoped endpoints.
router.get("/:appraisalId", protect, authorise([ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER, ROLES.REVIEWING_OFFICER, ROLES.ACCEPTING_OFFICER, ROLES.HR_ADMIN]), getGoalsByAppraisalId);
router.put("/:appraisalId", protect, authorise([ROLES.EMPLOYEE]), updateGoalsByAppraisalId);
router.put("/:appraisalId/submit", protect, authorise([ROLES.EMPLOYEE]), submitGoalsByAppraisalId);
router.put("/:appraisalId/approve", protect, authorise([ROLES.REPORTING_OFFICER]), approveGoalsByAppraisalId);
router.put("/:appraisalId/sendback", protect, authorise([ROLES.REPORTING_OFFICER]), sendbackGoalsByAppraisalId);

export default router;
