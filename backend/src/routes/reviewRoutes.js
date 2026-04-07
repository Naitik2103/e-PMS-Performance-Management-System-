import express from "express";
import {
  submitSelfSummary,
  rateByRO,
  reviewByReviewing,
  acceptByAccepting,
  listMyReviews,
  listQueue,
  listAttributeMasters,
  getRevoForm,
  getAoForm
} from "../controllers/reviewController.js";
import { selfSummaryValidation, roRatingValidation, remarkValidation } from "../validation/reviewValidation.js";
import { validate } from "../middleware/validate.js";
import { protect } from "../middleware/auth.js";
import { authorizeRoles } from "../middleware/roles.js";
import { ROLES } from "../constants/rbac.js";

const router = express.Router();

router.get("/my", protect, authorizeRoles(ROLES.EMPLOYEE), listMyReviews);
router.get("/queue", protect, listQueue);
router.get("/attributes/master", protect, listAttributeMasters);

router.post("/self-summary", protect, authorizeRoles(ROLES.EMPLOYEE), selfSummaryValidation, validate, submitSelfSummary);
router.post("/ro-rate", protect, authorizeRoles(ROLES.REPORTING_OFFICER), roRatingValidation, validate, rateByRO);
router.post("/review-approve", protect, authorizeRoles(ROLES.REVIEWING_OFFICER), remarkValidation, validate, reviewByReviewing);
router.post("/accept", protect, authorizeRoles(ROLES.ACCEPTING_OFFICER), remarkValidation, validate, acceptByAccepting);
router.get("/ratings/:appraisalId/revo-form", protect, authorizeRoles(ROLES.REVIEWING_OFFICER), getRevoForm);
router.get("/ratings/:appraisalId/ao-form", protect, authorizeRoles(ROLES.ACCEPTING_OFFICER), getAoForm);

export default router;
