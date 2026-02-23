const { body } = require("express-validator");

const selfSummaryValidation = [
  body("year").isInt({ min: 2000 }).withMessage("Valid year is required"),
  body("selfSummary").trim().notEmpty().withMessage("Self summary is required")
];

const roRatingValidation = [
  body("reviewId").isMongoId().withMessage("Valid reviewId is required"),
  body("score").isInt({ min: 0, max: 100 }).withMessage("Score must be 0-100")
];

const remarkValidation = [
  body("reviewId").isMongoId().withMessage("Valid reviewId is required"),
  body("remarks").trim().notEmpty().withMessage("Remarks are required")
];

module.exports = { selfSummaryValidation, roRatingValidation, remarkValidation };
