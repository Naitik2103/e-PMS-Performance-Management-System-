import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    
    console.log('--- appraisals table ---');
    const resAppraisals = await client.query(\"SELECT column_name FROM information_schema.columns WHERE table_name = 'appraisals'\");
    resAppraisals.rows.forEach(row => console.log(row.column_name));

    console.log('\n--- goals table ---');
    const resGoals = await client.query(\"SELECT column_name FROM information_schema.columns WHERE table_name = 'goals'\");
    resGoals.rows.forEach(row => console.log(row.column_name));
    
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
main();
