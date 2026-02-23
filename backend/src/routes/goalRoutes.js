const express = require("express");
const {
  createGoal,
  updateGoal,
  submitGoal,
  listMyGoals,
  listAllGoals,
  listGoalsForRO,
  listGoalsForReviewing,
  approveGoalByRO,
  approveGoalByReviewing
} = require("../controllers/goalController");
const { goalValidation } = require("../validation/goalValidation");
const { validate } = require("../middleware/validate");
const { protect } = require("../middleware/auth");
const { allowRoles } = require("../middleware/roles");

const router = express.Router();

router.get("/my", protect, allowRoles("Employee"), listMyGoals);
router.get("/all", protect, allowRoles("Admin"), listAllGoals);
router.post("/", protect, allowRoles("Employee"), goalValidation, validate, createGoal);
router.put("/:id", protect, allowRoles("Employee"), goalValidation, validate, updateGoal);
router.post("/:id/submit", protect, allowRoles("Employee"), submitGoal);

router.get("/pending/ro", protect, allowRoles("ReportingOfficer"), listGoalsForRO);
router.get("/pending/review", protect, allowRoles("ReviewingOfficer"), listGoalsForReviewing);
router.post("/:id/approve/ro", protect, allowRoles("ReportingOfficer"), approveGoalByRO);
router.post("/:id/approve/review", protect, allowRoles("ReviewingOfficer"), approveGoalByReviewing);

module.exports = router;
