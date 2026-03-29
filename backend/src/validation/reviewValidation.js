const { body } = require("express-validator");

const selfSummaryValidation = [
  body("cycleId").optional().isUUID().withMessage("cycleId must be valid UUID"),
  body("year").optional().isInt({ min: 2000 }).withMessage("Valid year is required"),
  body("selfSummary").trim().notEmpty().withMessage("Self summary is required"),
  body("goalRatings").optional().isArray(),
  body("goalRatings.*.goalId").optional().isUUID(),
  body("goalRatings.*.selfRating").optional().isInt({ min: 1, max: 5 })
];

const roRatingValidation = [
  body("reviewId").isUUID().withMessage("Valid reviewId is required"),
  body("score").optional().isInt({ min: 1, max: 5 }).withMessage("Score must be 1-5"),
  body("attributeRatings").optional().isArray(),
  body("attributeRatings.*.attributeId").optional().isUUID(),
  body("attributeRatings.*.rating").optional().isInt({ min: 1, max: 5 })
];

const remarkValidation = [
  body("reviewId").isUUID().withMessage("Valid reviewId is required"),
  body("score").optional().isInt({ min: 1, max: 5 }),
  body("attributeRatings").optional().isArray(),
  body("attributeRatings.*.attributeId").optional().isUUID(),
  body("attributeRatings.*.rating").optional().isInt({ min: 1, max: 5 }),
  body("remarks").trim().notEmpty().withMessage("Remarks are required")
];

module.exports = { selfSummaryValidation, roRatingValidation, remarkValidation };
