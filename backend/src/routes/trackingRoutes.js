import express from "express";
import { upsertTracking, submitTracking, addRoRemarks, listMyTracking, listTeamTracking } from "../controllers/trackingController.js";
import { trackingValidation, reportingRemarkValidation } from "../validation/trackingValidation.js";
import { validate } from "../middleware/validate.js";
import { protect } from "../middleware/auth.js";
import { authorizeRoles } from "../middleware/roles.js";
import { ROLES } from "../constants/rbac.js";

const router = express.Router();

router.get("/my", protect, authorizeRoles(ROLES.EMPLOYEE), listMyTracking);
router.get("/team", protect, authorizeRoles(ROLES.REPORTING_OFFICER), listTeamTracking);
router.post("/", protect, authorizeRoles(ROLES.EMPLOYEE), trackingValidation, validate, upsertTracking);
router.post("/submit", protect, authorizeRoles(ROLES.EMPLOYEE), submitTracking);
router.post("/remarks", protect, authorizeRoles(ROLES.REPORTING_OFFICER), reportingRemarkValidation, validate, addRoRemarks);

export default router;
