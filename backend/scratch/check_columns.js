import pool from '../src/config/db.js';

async function check() {
  try {
    const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'appraisals'");
    console.log("Appraisals Columns:", r.rows.map(row => row.column_name));
    
    const r2 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'score_summary'");
    console.log("Score Summary Columns:", r2.rows.map(row => row.column_name));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
check();
