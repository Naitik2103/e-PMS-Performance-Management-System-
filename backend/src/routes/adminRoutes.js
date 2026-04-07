import express from "express";
import {
  listCycles,
  createCycle,
  updateCycle,
  listAttributeMasters,
  createAttributeMaster,
  updateAttributeMaster,
  roleAssignment
} from "../controllers/adminController.js";
import { protect } from "../middleware/auth.js";
import { authorizeRoles } from "../middleware/roles.js";
import { ROLES } from "../constants/rbac.js";

const router = express.Router();

router.use(protect, authorizeRoles(ROLES.HR_ADMIN));
router.get("/cycles", listCycles);
router.post("/cycles", createCycle);
router.put("/cycles/:id", updateCycle);
router.get("/attributes", listAttributeMasters);
router.post("/attributes", createAttributeMaster);
router.put("/attributes/:id", updateAttributeMaster);
router.put("/users/:id/role", roleAssignment);

export default router;
