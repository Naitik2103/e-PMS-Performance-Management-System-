require("dotenv").config();
const { Pool } = require("pg");

async function run() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  const appraisalId = "1eae76e9-8975-4498-b6b0-7d68aa511208";

  try {
    const appRes = await pool.query("SELECT employee_id, cycle_id FROM appraisals WHERE id = $1 LIMIT 1", [appraisalId]);
    if (appRes.rows.length === 0) {
      console.log("Appraisal not found");
      return;
    }
    const { employee_id, cycle_id } = appRes.rows[0];

    const query = `
      SELECT
        g.goal_id,
        g.goal_title,
        g.goal_description,
        agr.achievement_text,
        smr.progress_text as "sixMonthProgressText",
        smrv.progress_text as "sixMonthProgressTextLegacy",
        g.user_id,
        g.cycle_id,
        g.appraisal_id,
        g.created_at
      FROM goals g
      LEFT JOIN appraisal_goal_ratings agr ON agr.goal_id = g.goal_id AND agr.appraisal_id = $1
      LEFT JOIN six_month_review smr ON smr.goal_id = g.goal_id AND smr.employee_id = $2 AND smr.cycle_id = $3
      LEFT JOIN six_month_reviews smrv ON smrv.goal_id = g.goal_id AND smrv.employee_id = $2 AND smrv.cycle_id = $3
      WHERE (g.appraisal_id = $1 OR (g.user_id = $2 AND g.cycle_id = $3))
      ORDER BY g.created_at ASC
    `;

    const goalsRes = await pool.query(query, [appraisalId, employee_id, cycle_id]);

    goalsRes.rows.forEach(row => {
      console.log(`${row.goal_id}, ${row.goal_title}, ${row.goal_description}, ${row.achievement_text}, ${row.sixMonthProgressText}, ${row.sixMonthProgressTextLegacy}, ${row.user_id}, ${row.cycle_id}, ${row.appraisal_id}, ${row.created_at}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
