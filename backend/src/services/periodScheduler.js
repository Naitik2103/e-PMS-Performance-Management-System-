import pool from "../config/db.js";
import { notifyAllUsers } from "./notificationService.js";

/**
 * Periodically checks for appraisal cycle period transitions (Opening/Closing)
 * and sends system-wide notifications.
 */
const checkPeriodTransitions = async () => {
  try {
    // 1. Get the active cycle
    const { rows: cycles } = await pool.query(
      `SELECT 
        cycle_id, 
        cycle_name,
        goal_setting_start, goal_setting_end,
        six_month_progress_review_start, six_month_progress_review_end,
        annual_appraisal_start, annual_appraisal_end
       FROM appraisal_cycles 
       WHERE status = 'active' 
       LIMIT 1`
    );

    if (!cycles.length) return;
    const cycle = cycles[0];
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    const periods = [
      { name: "Goal Setting", start: cycle.goal_setting_start, end: cycle.goal_setting_end },
      { name: "Six-Month Review", start: cycle.six_month_progress_review_start, end: cycle.six_month_progress_review_end },
      { name: "Annual Appraisal", start: cycle.annual_appraisal_start, end: cycle.annual_appraisal_end }
    ];

    for (const p of periods) {
      const startStr = p.start ? new Date(p.start).toISOString().split("T")[0] : null;
      const endStr = p.end ? new Date(p.end).toISOString().split("T")[0] : null;

      // Check if period starts today
      if (startStr === todayStr) {
        await triggerAutoNotification(cycle.cycle_id, `${p.name} Period Started`, 
          `The ${p.name} period for ${cycle.cycle_name} is now OPEN. Please check your dashboard.`);
      }

      // Check if period ends today (Closing soon)
      if (endStr === todayStr) {
        await triggerAutoNotification(cycle.cycle_id, `${p.name} Period Closing`, 
          `Reminder: The ${p.name} period for ${cycle.cycle_name} is CLOSING today. Please ensure all submissions are complete.`);
      }
    }
  } catch (error) {
    console.error("Error in checkPeriodTransitions:", error.message);
  }
};

/**
 * Helper to prevent duplicate notifications for the same event on the same day.
 */
const triggerAutoNotification = async (cycleId, title, message) => {
  // Check if we already sent this notification for this cycle today
  const { rows } = await pool.query(
    `SELECT 1 FROM notifications 
     WHERE entity_id = $1 
     AND subject = $2 
     AND send_at >= CURRENT_DATE 
     LIMIT 1`,
    [cycleId, title]
  );

  if (rows.length === 0) {
    console.log(`[Auto-Notif] Sending: ${title}`);
    await notifyAllUsers({
      title,
      message,
      type: "system",
      entity: "appraisal_cycle",
      entityId: cycleId
    });
  }
};

/**
 * Starts the background scheduler
 */
const startPeriodScheduler = () => {
  // Run once on startup
  checkPeriodTransitions();
  
  // Run every 6 hours
  setInterval(checkPeriodTransitions, 6 * 60 * 60 * 1000);
};

export { startPeriodScheduler };
