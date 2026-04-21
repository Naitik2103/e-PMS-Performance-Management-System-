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

const namePattern = /^[\p{L}]+$/u;
const phonePattern = /^\d{10}$/;
const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

const createUserValidation = [
  body("firstName")
    .trim()
    .notEmpty().withMessage("First name is required")
    .matches(namePattern).withMessage("First name must contain letters only"),
  body("lastName")
    .trim()
    .notEmpty().withMessage("Last name is required")
    .matches(namePattern).withMessage("Last name must contain letters only"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("phone")
    .optional({ checkFalsy: true })
    .matches(phonePattern).withMessage("Phone number must be exactly 10 digits")
    .custom((value) => {
      if (!value) return true;
      const digits = String(value).replace(/\D/g, "");
      if (digits.length !== 10) {
        throw new Error("Phone number must contain exactly 10 digits");
      }
      return true;
    }),
  body("password")
    .isLength({ min: 12 }).withMessage("Password must be at least 12 characters")
    .matches(strongPasswordPattern).withMessage("Password must include upper, lower, number and symbol"),
  body("role").optional().isIn(allowedRoles).withMessage("Invalid role"),
  body("department").trim().notEmpty().withMessage("Department is required"),
  body("reportingTo").optional({ checkFalsy: true }).isUUID().withMessage("reportingTo must be a valid UUID"),
  body("reviewingOfficerId").optional({ checkFalsy: true }).isUUID().withMessage("reviewingOfficerId must be a valid UUID"),
  body("acceptingOfficerId").optional({ checkFalsy: true }).isUUID().withMessage("acceptingOfficerId must be a valid UUID")
];

const updateUserValidation = [
  body("role").optional().isIn(allowedRoles).withMessage("Invalid role"),
  body("department").optional().trim().notEmpty().withMessage("Department is required"),
  body("reportingTo").optional({ checkFalsy: true }).isUUID().withMessage("reportingTo must be a valid UUID"),
  body("reviewingOfficerId").optional({ checkFalsy: true }).isUUID().withMessage("reviewingOfficerId must be a valid UUID"),
  body("acceptingOfficerId").optional({ checkFalsy: true }).isUUID().withMessage("acceptingOfficerId must be a valid UUID")
];

export { createUserValidation, updateUserValidation };
