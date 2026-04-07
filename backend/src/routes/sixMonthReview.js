import express from "express";
import { protect } from "../middleware/auth.js";
import { authorise } from "../middleware/authorise.js";
import { ROLES } from "../constants/rbac.js";
import { listMyTracking, listTeamTracking, upsertTracking, addRoRemarks } from "../controllers/trackingController.js";

const router = express.Router();

router.get("/:appraisalId", protect, authorise([ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER, ROLES.REVIEWING_OFFICER, ROLES.ACCEPTING_OFFICER, ROLES.HR_ADMIN]), (req, res, next) => {
  if (req.user.role === ROLES.EMPLOYEE) return listMyTracking(req, res, next);
  return listTeamTracking(req, res, next);
});
router.post("/:appraisalId", protect, authorise([ROLES.EMPLOYEE]), upsertTracking);
router.post("/:appraisalId/ro-remarks", protect, authorise([ROLES.REPORTING_OFFICER]), addRoRemarks);

export default router;
