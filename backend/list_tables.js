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

    console.log("--- Tables in Public Schema ---");
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.table(tables.rows);

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}
run();
