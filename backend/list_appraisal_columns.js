require('dotenv').config();
const { Client } = require('pg');

async function checkColumns() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/e_pms'
  });

  try {
    await client.connect();
    const query = \
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'appraisals'
    \;
    const res = await client.query(query);
    const columns = res.rows.map(row => row.column_name);
    console.log('Columns in appraisals table:', columns.join(', '));
    
    const targetColumns = ['updated_at', 'goals_submitted_at', 'self_appraisal_submitted_at', 'ro_reviewed_at', 'revo_reviewed_at', 'ao_reviewed_at', 'completed_at', 'id'];
    const available = targetColumns.filter(col => columns.includes(col));
    console.log('Available ordering columns:', available.join(', '));
  } catch (err) {
    console.error('Error connecting to DB:', err.message);
  } finally {
    await client.end();
  }
}

checkColumns();
