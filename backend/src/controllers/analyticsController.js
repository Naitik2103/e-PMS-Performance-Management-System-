import pool from "../config/db.js";

/**
 * Fetches cross-sectional analytics for the HR Admin Dashboard.
 * Includes period progress, departmental completion, score distribution, and org-level performance.
 */
const getDashboardAnalytics = async (req, res, next) => {
  try {
    // 1. Get the current active cycle
    const { rows: cycleRows } = await pool.query(
      "SELECT cycle_id, cycle_name FROM appraisal_cycles WHERE closed_at IS NULL LIMIT 1"
    );
    
    if (!cycleRows.length) {
      return res.json({ 
        message: "No active cycle found", 
        stats: null 
      });
    }
    
    const cycleId = cycleRows[0].cycle_id;
    const cycleName = cycleRows[0].cycle_name;

    // --- Option 1: Triple Period Progress ---
    // Goal Completion: Employees who have submitted their goals
    const goalStats = await pool.query(`
      SELECT 
        COUNT(DISTINCT employee_id) FILTER (WHERE reporting_officer_id IS NOT NULL) as submitted,
        COUNT(DISTINCT employee_id) as total
      FROM appraisal_cycle_participants
      WHERE cycle_id = $1
    `, [cycleId]);

    // Six-Month Completion: Employees with submitted reviews
    const sixMonthStats = await pool.query(`
      SELECT 
        COUNT(DISTINCT employee_id) FILTER (WHERE status IN ('submitted', 'remarked')) as submitted,
        COUNT(DISTINCT employee_id) as total
      FROM six_month_review
      WHERE cycle_id = $1
    `, [cycleId]);

    // Annual Completion: Count all that have moved past the 'draft' stage (i.e., process started)
    const annualStats = await pool.query(`
      SELECT 
        COUNT(1) FILTER (WHERE status != 'draft') as submitted,
        COUNT(1) as total
      FROM appraisals
      WHERE cycle_id = $1
    `, [cycleId]);

    // --- Determine Current Phase for Dynamic Leaderboard ---
    const goalCount = parseInt(goalStats.rows[0].submitted || 0);
    const sixMonthCount = parseInt(sixMonthStats.rows[0].submitted || 0);
    const annualCount = parseInt(annualStats.rows[0].submitted || 0);

    let currentPhase = "Annual Appraisal";
    if (annualCount === 0) {
      if (sixMonthCount > 0) currentPhase = "Six-Month Review";
      else currentPhase = "Goal Setting";
    }

    // --- Option 2: Departmental Completion (Phase-Dynamic) ---
    let deptQuery = "";
    if (currentPhase === "Annual Appraisal") {
      deptQuery = `
        SELECT d.name, COUNT(a.id) as total, COUNT(a.id) FILTER (WHERE a.status != 'draft') as completed
        FROM departments d
        JOIN users u ON u.department_id = d.id
        JOIN appraisals a ON a.employee_id = u.user_id
        WHERE a.cycle_id = $1
        GROUP BY d.name ORDER BY completed DESC LIMIT 10
      `;
    } else if (currentPhase === "Six-Month Review") {
      deptQuery = `
        SELECT d.name, COUNT(sm.review_id) as total, COUNT(sm.review_id) FILTER (WHERE sm.status IN ('submitted', 'remarked')) as completed
        FROM departments d
        JOIN users u ON u.department_id = d.id
        JOIN six_month_review sm ON sm.employee_id = u.user_id
        WHERE sm.cycle_id = $1
        GROUP BY d.name ORDER BY completed DESC LIMIT 10
      `;
    } else {
      deptQuery = `
        SELECT d.name, COUNT(p.id) as total, COUNT(p.id) FILTER (WHERE p.reporting_officer_id IS NOT NULL) as completed
        FROM departments d
        JOIN users u ON u.department_id = d.id
        JOIN appraisal_cycle_participants p ON p.employee_id = u.user_id
        WHERE p.cycle_id = $1
        GROUP BY d.name ORDER BY completed DESC LIMIT 10
      `;
    }

    const deptStats = await pool.query(deptQuery, [cycleId]);

    // --- Option 3: Score Distribution (Bell Curve) ---
    const scoreDist = await pool.query(`
      SELECT FLOOR(final_score)::int as bucket, COUNT(1) as count
      FROM score_summary ss
      JOIN appraisals a ON a.id = ss.appraisal_id
      WHERE a.cycle_id = $1 AND a.status = 'completed'
      GROUP BY bucket ORDER BY bucket
    `, [cycleId]);

    // --- Option 5: Org Level Performance ---
    const levelStats = await pool.query(`
      SELECT u.org_level as level, AVG(ss.final_score) as avg_score
      FROM users u
      JOIN appraisals a ON a.employee_id = u.user_id
      JOIN score_summary ss ON ss.appraisal_id = a.id
      WHERE a.cycle_id = $1 AND a.status = 'completed'
      GROUP BY u.org_level ORDER BY u.org_level
    `, [cycleId]);

    return res.json({
      cycleName,
      currentPhase,
      periodProgress: {
        goal: { submitted: goalCount, total: parseInt(goalStats.rows[0].total || 0) },
        sixMonth: { submitted: sixMonthCount, total: parseInt(sixMonthStats.rows[0].total || 0) },
        annual: { submitted: annualCount, total: parseInt(annualStats.rows[0].total || 0) }
      },
      departmentalStats: deptStats.rows.map(r => ({
        name: r.name,
        completed: parseInt(r.completed),
        total: parseInt(r.total)
      })),
      scoreDistribution: scoreDist.rows.map(r => ({
        range: `${r.bucket}-${r.bucket + 1}`,
        count: parseInt(r.count)
      })),
      orgLevelStats: levelStats.rows.map(r => ({
        level: `Level ${r.level}`,
        score: parseFloat(parseFloat(r.avg_score).toFixed(2))
      }))
    });

  } catch (error) {
    next(error);
  }
};

export { getDashboardAnalytics };
