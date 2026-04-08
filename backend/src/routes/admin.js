import express from "express";
import { protect } from "../middleware/auth.js";
import { authorise } from "../middleware/authorise.js";
import { ROLES } from "../constants/rbac.js";
import { listCycles, createCycle, updateCycle } from "../controllers/adminController.js";
import { createUser, listUsers, updateUser } from "../controllers/userController.js";
import pool from "../config/db.js";

const router = express.Router();
router.use(protect, authorise([ROLES.HR_ADMIN]));

router.get("/users", listUsers);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.put("/users/:id/deactivate", async (req, res, next) => {
  try {
    await pool.query("UPDATE users SET is_active = false WHERE user_id = $1", [req.params.id]);
    return res.json({ id: req.params.id, isActive: false });
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
    const { rows } = await pool.query("SELECT * FROM appraisals ORDER BY completed_at DESC NULLS LAST");
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
});
router.get("/audit-log", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500");
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
});
router.get("/analytics", async (req, res, next) => {
  try {
    const total = await pool.query("SELECT COUNT(1)::int AS c FROM appraisals");
    const completed = await pool.query("SELECT COUNT(1)::int AS c FROM appraisals WHERE status = 'completed'");
    const totalCount = total.rows[0]?.c || 0;
    const completedCount = completed.rows[0]?.c || 0;
    return res.json({
      totalAppraisals: totalCount,
      completedAppraisals: completedCount,
      completionRate: totalCount ? completedCount / totalCount : 0
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
