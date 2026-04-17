import { body } from "express-validator";

const loginValidation = [
  body("email")
    .optional()
    .isEmail()
    .withMessage("Valid email is required"),
  body("employee_id")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("employee_id must be a non-empty string"),
  body().custom((value) => {
    if (!value?.email && !value?.employee_id) {
      throw new Error("Either email or employee_id is required");
    }
    return true;
  }),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters")
];

const forgotPasswordRequestValidation = [
  body("email").isEmail().withMessage("Valid email is required")
];

const forgotPasswordVerifyValidation = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("otp")
    .isString()
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be a 6-digit code")
];

const forgotPasswordResetValidation = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("otp")
    .isString()
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be a 6-digit code"),
  body("newPassword").isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
];

export {
  loginValidation,
  forgotPasswordRequestValidation,
  forgotPasswordVerifyValidation,
  forgotPasswordResetValidation
};
