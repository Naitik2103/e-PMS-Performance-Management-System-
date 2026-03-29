const express = require("express");
const {
  listCycles,
  createCycle,
  updateCycle,
  listAttributeMasters,
  createAttributeMaster,
  updateAttributeMaster,
  roleAssignment
} = require("../controllers/adminController");
const { protect } = require("../middleware/auth");
const { authorizeRoles } = require("../middleware/roles");

const router = express.Router();

router.use(protect, authorizeRoles("Admin"));
router.get("/cycles", listCycles);
router.post("/cycles", createCycle);
router.put("/cycles/:id", updateCycle);
router.get("/attributes", listAttributeMasters);
router.post("/attributes", createAttributeMaster);
router.put("/attributes/:id", updateAttributeMaster);
router.put("/users/:id/role", roleAssignment);

module.exports = router;
