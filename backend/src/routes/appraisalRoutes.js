import express from "express";
import { protect } from "../middleware/auth.js";
import { authorizeRoles } from "../middleware/roles.js";
import { ROLES } from "../constants/rbac.js";
import {
  listMine,
  listMyTeam,
  listMyReviewList,
  listMyAcceptList,
  getSummary,
  getAccessWindow
} from "../controllers/appraisalController.js";

const router = express.Router();

router.get("/mine", protect, authorizeRoles(ROLES.EMPLOYEE), listMine);
router.get("/my-team", protect, authorizeRoles(ROLES.REPORTING_OFFICER), listMyTeam);
router.get("/my-review-list", protect, authorizeRoles(ROLES.REVIEWING_OFFICER), listMyReviewList);
router.get("/my-accept-list", protect, authorizeRoles(ROLES.ACCEPTING_OFFICER), listMyAcceptList);
router.get("/access-window", protect, authorizeRoles(ROLES.EMPLOYEE, ROLES.HR_ADMIN), getAccessWindow);
router.get("/:id/summary", protect, authorizeRoles(ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER, ROLES.REVIEWING_OFFICER, ROLES.ACCEPTING_OFFICER, ROLES.HR_ADMIN), getSummary);

export default router;
