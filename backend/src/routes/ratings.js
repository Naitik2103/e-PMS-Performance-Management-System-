import express from "express";
import { protect } from "../middleware/auth.js";
import { authorise } from "../middleware/authorise.js";
import { ROLES } from "../constants/rbac.js";
import { rateByRO, reviewByReviewing, acceptByAccepting, getRevoForm, getAoForm } from "../controllers/reviewController.js";

const router = express.Router();

router.post("/:appraisalId/ro", protect, authorise([ROLES.REPORTING_OFFICER]), (req, res, next) => {
  req.body.reviewId = req.params.appraisalId;
  return rateByRO(req, res, next);
});
router.get("/:appraisalId/revo-form", protect, authorise([ROLES.REVIEWING_OFFICER]), getRevoForm);
router.post("/:appraisalId/revo", protect, authorise([ROLES.REVIEWING_OFFICER]), (req, res, next) => {
  req.body.reviewId = req.params.appraisalId;
  return reviewByReviewing(req, res, next);
});
router.get("/:appraisalId/ao-form", protect, authorise([ROLES.ACCEPTING_OFFICER]), getAoForm);
router.post("/:appraisalId/accept", protect, authorise([ROLES.ACCEPTING_OFFICER]), (req, res, next) => {
  req.body.reviewId = req.params.appraisalId;
  return acceptByAccepting(req, res, next);
});

export default router;
