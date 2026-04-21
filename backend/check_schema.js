import pool from "./src/config/db.js";

async function checkSchema() {
  try {
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log("Tables:", tables.rows.map(r => r.table_name));

    for (const table of ['users', 'goals', 'departments']) {
      const columns = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [table]);
      console.log(`\nColumns for ${table}:`);
      columns.rows.forEach(c => console.log(` - ${c.column_name}: ${c.data_type}`));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkSchema();
