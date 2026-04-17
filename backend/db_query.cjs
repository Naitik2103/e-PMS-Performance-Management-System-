const { Client } = require('pg');
require('dotenv').config();

async function run() {
  const connectionString = process.env.DATABASE_URL;
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    const tables = ['six_month_review', 'six_month_reviews', 'appraisal_goal_ratings', 'self_appraisal_kpa_ratings'];
    
    console.log('--- 1) Columns ---');
    for (const table of tables) {
      const colRes = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 
        ORDER BY ordinal_position
      `, [table]);
      console.log(`Table: ${table}`);
      console.log(colRes.rows.map(r => r.column_name).join(', '));
      console.log('');
    }

    console.log('--- 2) Maharshi appraisal id rows ---');
    const appraisalId = '1eae76e9-8975-4498-b6b0-7d68aa511208';
    const q2 = await client.query('SELECT * FROM appraisal_goal_ratings WHERE appraisal_id = $1', [appraisalId]);
    console.log(JSON.stringify(q2.rows, null, 2));

    console.log('\n--- 3) Six month review/reviews rows ---');
    const empId = 'fcfe28f2-fa4f-4c14-8e1c-0a5fd9d10693';
    const cycleId = 'b5f3d7dc-f3e3-43b4-b55a-ff81977443d2';
    
    // Note: column names might differ, will use employee_id/cycle_id or similar if columns allow
    // Checking columns first would be safer, but I'll try common names or adjust based on (1) if I had to.
    // Actually, I'll fetch columns first in step 1, but for the script to be one-shot:
    try {
        const q3a = await client.query('SELECT * FROM six_month_review WHERE employee_id = $1 AND cycle_id = $2', [empId, cycleId]);
        console.log('six_month_review:', JSON.stringify(q3a.rows, null, 2));
    } catch(e) { console.log('six_month_review query failed'); }

    try {
        const q3b = await client.query('SELECT * FROM six_month_reviews WHERE employee_id = $1 AND cycle_id = $2', [empId, cycleId]);
        console.log('six_month_reviews:', JSON.stringify(q3b.rows, null, 2));
    } catch(e) { console.log('six_month_reviews query failed'); }

    console.log('\n--- 4) self_appraisal_kpa_ratings rows ---');
    // Using simple select to see linkage
    const q4 = await client.query('SELECT * FROM self_appraisal_kpa_ratings LIMIT 10');
    console.log(JSON.stringify(q4.rows, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
