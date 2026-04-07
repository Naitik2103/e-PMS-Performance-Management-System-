import express from "express";
import { protect } from "../middleware/auth.js";
import { authorise } from "../middleware/authorise.js";
import { ROLES } from "../constants/rbac.js";
import { submitSelfSummary } from "../controllers/reviewController.js";

const router = express.Router();

router.get("/:appraisalId", protect, authorise([ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER, ROLES.REVIEWING_OFFICER, ROLES.ACCEPTING_OFFICER, ROLES.HR_ADMIN]), (req, res) => {
  // Existing app uses submit endpoint; read endpoint currently returns placeholder.
  res.json({ appraisalId: req.params.appraisalId, message: "Use reviews data endpoints for full self-appraisal payload." });
});
router.post("/:appraisalId", protect, authorise([ROLES.EMPLOYEE]), (req, res, next) => {
  req.body.reviewId = req.params.appraisalId;
  return submitSelfSummary(req, res, next);
});
router.put("/:appraisalId/submit", protect, authorise([ROLES.EMPLOYEE]), (req, res, next) => {
  req.body.reviewId = req.params.appraisalId;
  return submitSelfSummary(req, res, next);
});

export default router;
