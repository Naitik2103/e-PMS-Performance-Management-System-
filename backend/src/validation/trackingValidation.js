const { body } = require("express-validator");

const trackingValidation = [
  body("goalId").isMongoId().withMessage("Valid goalId is required"),
  body("year").isInt({ min: 2000 }).withMessage("Valid year is required"),
  body("period").isIn(["H1", "H2"]).withMessage("Period must be H1 or H2"),
  body("progressEntries").isArray({ min: 1 }).withMessage("Progress entries are required"),
  body("progressEntries.*.kpaTitle").trim().notEmpty().withMessage("KPA title is required"),
  body("progressEntries.*.progress").trim().notEmpty().withMessage("Progress is required")
];

const roRemarkValidation = [
  body("trackingId").isMongoId().withMessage("Valid trackingId is required"),
  body("roRemarks").trim().notEmpty().withMessage("Remarks are required")
];

module.exports = { trackingValidation, roRemarkValidation };
