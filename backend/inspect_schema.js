import pkg from "pg";
const { Client } = pkg;
import "dotenv/config";

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    console.log("--- Schema Inspection ---");
    const cols = await client.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_name IN ('users', 'appraisals', 'cycles', 'appraisal_goal_ratings')
      ORDER BY table_name, ordinal_position
    `);
    console.table(cols.rows);

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}
run();
