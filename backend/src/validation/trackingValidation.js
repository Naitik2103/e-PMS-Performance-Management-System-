import { body } from "express-validator";

const trackingValidation = [
  body("goalId").isUUID().withMessage("Valid goalId is required"),
  body("cycleId").optional().isUUID().withMessage("Valid cycleId is required"),
  body("period").isIn(["H1", "H2"]).withMessage("Period must be H1 or H2"),
  body("progressText").trim().notEmpty().withMessage("Progress text is required")
];

const reportingRemarkValidation = [
  body("trackingId").isUUID().withMessage("Valid trackingId is required"),
  body("reportingRemarks").trim().notEmpty().withMessage("Remarks are required")
];

export { trackingValidation, reportingRemarkValidation };
