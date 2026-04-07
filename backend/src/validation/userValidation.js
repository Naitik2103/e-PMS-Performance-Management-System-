import { body } from "express-validator";
import { ROLES } from "../constants/rbac.js";

const allowedRoles = [
  ROLES.EMPLOYEE,
  ROLES.REPORTING_OFFICER,
  ROLES.REVIEWING_OFFICER,
  ROLES.ACCEPTING_OFFICER,
  ROLES.HR_ADMIN,
  "Employee",
  "ReportingOfficer",
  "ReviewingOfficer",
  "AcceptingOfficer",
  "Admin"
];

const createUserValidation = [
  body("firstName").trim().notEmpty().withMessage("First name is required"),
  body("lastName").trim().notEmpty().withMessage("Last name is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("role").optional().isIn(allowedRoles).withMessage("Invalid role"),
  body("department").trim().notEmpty().withMessage("Department is required"),
  body("reportingTo").optional().isUUID().withMessage("reportingTo must be a valid UUID"),
  body("reviewingOfficerId").optional().isUUID().withMessage("reviewingOfficerId must be a valid UUID"),
  body("acceptingOfficerId").optional().isUUID().withMessage("acceptingOfficerId must be a valid UUID")
];

const updateUserValidation = [
  body("role").optional().isIn(allowedRoles).withMessage("Invalid role"),
  body("department").optional().trim().notEmpty().withMessage("Department is required"),
  body("reportingTo").optional().isUUID().withMessage("reportingTo must be a valid UUID"),
  body("reviewingOfficerId").optional().isUUID().withMessage("reviewingOfficerId must be a valid UUID"),
  body("acceptingOfficerId").optional().isUUID().withMessage("acceptingOfficerId must be a valid UUID")
];

export { createUserValidation, updateUserValidation };
