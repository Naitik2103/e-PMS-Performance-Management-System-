const express = require("express");
const {
  submitSelfSummary,
  rateByRO,
  reviewByReviewing,
  acceptByAccepting,
  listMyReviews,
  listQueue,
  listAttributeMasters
} = require("../controllers/reviewController");
const { selfSummaryValidation, roRatingValidation, remarkValidation } = require("../validation/reviewValidation");
const { validate } = require("../middleware/validate");
const { protect } = require("../middleware/auth");
const { authorizeRoles } = require("../middleware/roles");

const router = express.Router();

router.get("/my", protect, authorizeRoles("Employee"), listMyReviews);
router.get("/queue", protect, listQueue);
router.get("/attributes/master", protect, listAttributeMasters);

router.post("/self-summary", protect, authorizeRoles("Employee"), selfSummaryValidation, validate, submitSelfSummary);
router.post("/ro-rate", protect, authorizeRoles("ReportingOfficer"), roRatingValidation, validate, rateByRO);
router.post("/review-approve", protect, authorizeRoles("ReviewingOfficer"), remarkValidation, validate, reviewByReviewing);
router.post("/accept", protect, authorizeRoles("AcceptingOfficer"), remarkValidation, validate, acceptByAccepting);

module.exports = router;
