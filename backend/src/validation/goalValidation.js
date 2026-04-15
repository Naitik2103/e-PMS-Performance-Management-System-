import { body } from "express-validator";

const goalValidation = [
  body("goalTitle").trim().notEmpty().withMessage("Goal title is required"),
  body("goalDescription").optional().isString(),
  body("weightage").isFloat({ min: 0.01, max: 100 }).withMessage("Weightage must be greater than 0 and less than or equal to 100"),
  body("cycleId").optional().isUUID().withMessage("cycleId must be a valid UUID"),
  body("year").optional().isInt({ min: 2000 }).withMessage("Valid year is required")
];

const submitValidation = [
  body("cycleId").optional().isUUID().withMessage("cycleId must be a valid UUID"),
  body("year").optional().isInt({ min: 2000 }).withMessage("Valid year is required")
];

export { goalValidation, submitValidation };
