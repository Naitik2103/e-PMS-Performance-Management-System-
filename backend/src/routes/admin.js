import express from "express";
import { protect } from "../middleware/auth.js";
import { authorise } from "../middleware/authorise.js";
import { ROLES } from "../constants/rbac.js";
import { listCycles, createCycle, updateCycle } from "../controllers/adminController.js";
import { createUser, listUsers, updateUser } from "../controllers/userController.js";
import { PerformanceReview, AuditLog, User } from "../models.js";

const router = express.Router();
router.use(protect, authorise([ROLES.HR_ADMIN]));

router.get("/users", listUsers);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.put("/users/:id/deactivate", async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.isActive = false;
    await user.save();
    return res.json({ id: user.id, isActive: user.isActive });
  } catch (error) {
    return next(error);
  }
});

router.get("/cycles", listCycles);
router.post("/cycles", createCycle);
router.put("/cycles/:id/activate", async (req, res, next) => {
  req.body.isActive = true;
  req.body.status = "active";
  return updateCycle(req, res, next);
});
router.put("/cycles/:id/close", async (req, res, next) => {
  req.body.isActive = false;
  req.body.status = "closed";
  return updateCycle(req, res, next);
});

router.get("/appraisals", async (req, res, next) => {
  try {
    const rows = await PerformanceReview.findAll({ order: [["createdAt", "DESC"]] });
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
});
router.get("/audit-log", async (req, res, next) => {
  try {
    const rows = await AuditLog.findAll({ order: [["createdAt", "DESC"]], limit: 500 });
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
});
router.get("/analytics", async (req, res, next) => {
  try {
    const all = await PerformanceReview.findAll();
    const completed = all.filter((r) => r.status === "completed" || r.status === "finalized").length;
    return res.json({ totalAppraisals: all.length, completedAppraisals: completed, completionRate: all.length ? completed / all.length : 0 });
  } catch (error) {
    return next(error);
  }
});

export default router;
