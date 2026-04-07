import express from "express";
import { createUser, listUsers, updateUser, hierarchy, listDepartments } from "../controllers/userController.js";
import { createUserValidation, updateUserValidation } from "../validation/userValidation.js";
import { validate } from "../middleware/validate.js";
import { protect } from "../middleware/auth.js";
import { allowRoles } from "../middleware/roles.js";
import { ROLES } from "../constants/rbac.js";

const router = express.Router();

router.use(protect, allowRoles(ROLES.HR_ADMIN));

router.post("/", createUserValidation, validate, createUser);
router.get("/", listUsers);
router.get("/departments", listDepartments);
router.get("/hierarchy", hierarchy);
router.put("/:id", updateUserValidation, validate, updateUser);

export default router;
