const { body } = require("express-validator");

const goalValidation = [
  body("year").isInt({ min: 2000 }).withMessage("Valid year is required"),
  body("kpas").isArray({ min: 1 }).withMessage("At least one KPA is required"),
  body("kpas.*.title").trim().notEmpty().withMessage("KPA title is required"),
  body("kpas.*.weight").isInt({ min: 0, max: 100 }).withMessage("KPA weight must be 0-100")
];

const submitValidation = [
  body("goalId").isMongoId().withMessage("Valid goalId is required")
];

module.exports = { goalValidation, submitValidation };
