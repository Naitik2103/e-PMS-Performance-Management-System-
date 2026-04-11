import express from "express";
import { authenticateJWT, authorizeContext } from "../middleware/adminApiAuth.js";
import { createUser, listUsers, updateUser } from "../controllers/userController.js";
import {
  getAllUsersForDropdowns,
  getDepartmentsAndDesignations,
  createHrUser,
  listCyclesWithStats,
  createCycleWithParticipants,
  getCycleParticipants,
  bulkSaveParticipants,
  activateCycle
} from "../controllers/adminHrController.js";
import pool from "../config/db.js";

const router = express.Router();
router.use(authenticateJWT, authorizeContext("hr_admin"));

router.get("/users/all", getAllUsersForDropdowns);
router.get("/meta/departments-designations", getDepartmentsAndDesignations);
router.post("/users", createHrUser);
router.get("/users", listUsers);
router.put("/users/:id", updateUser);
router.put("/users/:id/deactivate", async (req, res, next) => {
  try {
    await pool.query("UPDATE users SET is_active = false, updated_at = NOW() WHERE user_id = $1", [req.params.id]);
    return res.json({ id: req.params.id, isActive: false });
  } catch (error) {
    return next(error);
  }
});

router.get("/cycles", listCyclesWithStats);
router.post("/cycles", createCycleWithParticipants);
router.get("/cycles/:cycleId/participants", getCycleParticipants);
router.put("/cycles/:cycleId/participants", bulkSaveParticipants);
router.put("/cycles/:cycleId/activate", activateCycle);

router.put("/cycles/:id/close", async (req, res, next) => {
  try {
    const r = await pool.query(
      `UPDATE appraisal_cycles SET closed_at = NOW(), status = 'closed', updated_at = NOW() WHERE cycle_id = $1 RETURNING cycle_id`,
      [req.params.id]
    );
    if (!r.rows.length) {
      res.status(404);
      return next(new Error("Cycle not found"));
    }
    return res.json({ message: "Cycle closed", id: r.rows[0].cycle_id });
  } catch (error) {
    return next(error);
  }
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
