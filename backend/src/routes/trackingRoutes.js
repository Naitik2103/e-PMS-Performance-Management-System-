const express = require("express");
const { upsertTracking, addRoRemarks, listMyTracking, listTeamTracking } = require("../controllers/trackingController");
const { trackingValidation, reportingRemarkValidation } = require("../validation/trackingValidation");
const { validate } = require("../middleware/validate");
const { protect } = require("../middleware/auth");
const { authorizeRoles } = require("../middleware/roles");

const router = express.Router();

router.get("/my", protect, authorizeRoles("Employee"), listMyTracking);
router.get("/team", protect, authorizeRoles("ReportingOfficer"), listTeamTracking);
router.post("/", protect, authorizeRoles("Employee"), trackingValidation, validate, upsertTracking);
router.post("/remarks", protect, authorizeRoles("ReportingOfficer"), reportingRemarkValidation, validate, addRoRemarks);

module.exports = router;
