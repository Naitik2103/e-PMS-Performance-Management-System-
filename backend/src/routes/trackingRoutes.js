const express = require("express");
const { upsertTracking, addRoRemarks, listMyTracking, listTeamTracking } = require("../controllers/trackingController");
const { trackingValidation, roRemarkValidation } = require("../validation/trackingValidation");
const { validate } = require("../middleware/validate");
const { protect } = require("../middleware/auth");
const { allowRoles } = require("../middleware/roles");

const router = express.Router();

router.get("/my", protect, allowRoles("Employee"), listMyTracking);
router.get("/team", protect, allowRoles("ReportingOfficer"), listTeamTracking);
router.post("/", protect, allowRoles("Employee"), trackingValidation, validate, upsertTracking);
router.post("/remarks", protect, allowRoles("ReportingOfficer"), roRemarkValidation, validate, addRoRemarks);

module.exports = router;
