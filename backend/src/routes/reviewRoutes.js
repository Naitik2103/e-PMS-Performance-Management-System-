const express = require("express");
const {
  submitSelfSummary,
  rateByRO,
  reviewByReviewing,
  acceptByAccepting,
  listMyReviews,
  listQueue
} = require("../controllers/reviewController");
const { selfSummaryValidation, roRatingValidation, remarkValidation } = require("../validation/reviewValidation");
const { validate } = require("../middleware/validate");
const { protect } = require("../middleware/auth");
const { allowRoles } = require("../middleware/roles");

const router = express.Router();

router.get("/my", protect, allowRoles("Employee"), listMyReviews);
router.get("/queue", protect, listQueue);

router.post("/self-summary", protect, allowRoles("Employee"), selfSummaryValidation, validate, submitSelfSummary);
router.post("/ro-rate", protect, allowRoles("ReportingOfficer"), roRatingValidation, validate, rateByRO);
router.post("/review-approve", protect, allowRoles("ReviewingOfficer"), remarkValidation, validate, reviewByReviewing);
router.post("/accept", protect, allowRoles("AcceptingOfficer"), remarkValidation, validate, acceptByAccepting);

module.exports = router;
