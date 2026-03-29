const express = require("express");
const {
  createGoal,
  updateGoal,
  submitCycleGoals,
  listMyGoals,
  listAllGoals,
  listGoalsForRO,
  listGoalsForReviewing,
  approveGoalByRO,
  approveGoalByReviewing
} = require("../controllers/goalController");
const { goalValidation, submitValidation } = require("../validation/goalValidation");
const { validate } = require("../middleware/validate");
const { protect } = require("../middleware/auth");
const { authorizeRoles } = require("../middleware/roles");

const router = express.Router();

router.get("/my", protect, authorizeRoles("Employee"), listMyGoals);
router.get("/all", protect, authorizeRoles("Admin"), listAllGoals);
router.post("/", protect, authorizeRoles("Employee"), goalValidation, validate, createGoal);
router.put("/:id", protect, authorizeRoles("Employee"), goalValidation, validate, updateGoal);
router.post("/submit", protect, authorizeRoles("Employee"), submitValidation, validate, submitCycleGoals);

router.get("/pending/ro", protect, authorizeRoles("ReportingOfficer"), listGoalsForRO);
router.get("/pending/review", protect, authorizeRoles("ReviewingOfficer"), listGoalsForReviewing);
router.post("/:id/approve/ro", protect, authorizeRoles("ReportingOfficer"), approveGoalByRO);
router.post("/:id/approve/review", protect, authorizeRoles("ReviewingOfficer"), approveGoalByReviewing);

module.exports = router;
