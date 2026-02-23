const { body } = require("express-validator");

const createUserValidation = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("role").isIn(["Employee", "ReportingOfficer", "ReviewingOfficer", "AcceptingOfficer", "Admin"]).withMessage("Invalid role"),
  body("department").trim().notEmpty().withMessage("Department is required")
];

const updateUserValidation = [
  body("role").optional().isIn(["Employee", "ReportingOfficer", "ReviewingOfficer", "AcceptingOfficer", "Admin"]).withMessage("Invalid role"),
  body("department").optional().trim().notEmpty().withMessage("Department is required"),
  body("reportingTo").optional().isMongoId().withMessage("reportingTo must be a valid id")
];

module.exports = { createUserValidation, updateUserValidation };
