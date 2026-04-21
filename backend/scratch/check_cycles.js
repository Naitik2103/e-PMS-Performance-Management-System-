import pool from '../src/config/db.js';

async function check() {
  try {
    const r = await pool.query("SELECT cycle_id, cycle_name, closed_at FROM appraisal_cycles");
    console.log("Cycles:", JSON.stringify(r.rows, null, 2));
    
    const active = r.rows.find(c => !c.closed_at);
    if (active) {
        console.log("Active Cycle Found:", active.cycle_id);
    } else {
        console.log("No Active Cycle Found!");
    }
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
check();
