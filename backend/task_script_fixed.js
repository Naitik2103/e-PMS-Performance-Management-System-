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

    console.log("--- 1. Users matching 'maharshi' or 'naitik' ---");
    const userRes = await client.query(`
      SELECT user_id, first_name, last_name, email 
      FROM users 
      WHERE first_name ILIKE '%maharshi%' OR last_name ILIKE '%maharshi%' 
         OR first_name ILIKE '%naitik%' OR last_name ILIKE '%naitik%' 
         OR email ILIKE '%maharshi%' OR email ILIKE '%naitik%'
         OR full_name ILIKE '%maharshi%' OR full_name ILIKE '%naitik%'
    `);
    console.table(userRes.rows);

    const maharshi = userRes.rows.find(u => u.first_name.toLowerCase().includes('maharshi'));
    
    if (maharshi) {
      console.log(`\n--- 2. Appraisals for Maharshi (User ID: ${maharshi.user_id}) ---`);
      const appraisalRes = await client.query(`
        SELECT a.id, c.name as cycle, a.status, a.ro_id, a.revo_id, a.ao_id 
        FROM appraisals a
        LEFT JOIN cycles c ON a.cycle_id = c.id
        WHERE a.employee_id = $1
      `, [maharshi.user_id]);
      console.table(appraisalRes.rows);

      if (appraisalRes.rows.length > 0) {
        const ids = appraisalRes.rows.map(r => r.id);
        
        console.log("\n--- 3. Appraisal Goal Ratings (non-empty achievement) ---");
        const goalRes = await client.query(`
          SELECT id, appraisal_id, goal_id, achievement_text, self_rating 
          FROM appraisal_goal_ratings 
          WHERE appraisal_id = ANY($1) AND achievement_text IS NOT NULL AND achievement_text != ''
        `, [ids]);
        console.table(goalRes.rows);

        console.log("\n--- 4. Inspecting Self-Appraisal Tables ---");
        const tables = ['annual_self_appraisals', 'annual_self_appraisal', 'appraisal_self_appraisals'];
        for (const table of tables) {
          try {
            const tableCheck = await client.query(`SELECT 1 FROM information_schema.tables WHERE table_name = $1`, [table]);
            if (tableCheck.rowCount > 0) {
               console.log(`\nChecking table: ${table}`);
               const selfRes = await client.query(`SELECT * FROM ${table} WHERE appraisal_id = ANY($1) LIMIT 5`, [ids]);
               if(selfRes.rows.length > 0) {
                   console.table(selfRes.rows);
               } else {
                   console.log(`No rows found in ${table} for Maharshi's appraisal IDs.`);
               }
            }
          } catch (e) {
            console.log(`Error checking table ${table}: ${e.message}`);
          }
        }
      }
    } else {
      console.log("Maharshi not found in users.");
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}
run();
