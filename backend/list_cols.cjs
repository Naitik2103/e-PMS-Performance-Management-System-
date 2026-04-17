require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/e_pms' });
client.connect()
  .then(() => client.query('SELECT column_name FROM information_schema.columns WHERE table_name = \'appraisals\''))
  .then(res => {
    const columns = res.rows.map(row => row.column_name);
    console.log('Columns:', columns.join(', '));
    const target = ['updated_at', 'goals_submitted_at', 'self_appraisal_submitted_at', 'ro_reviewed_at', 'revo_reviewed_at', 'ao_reviewed_at', 'completed_at', 'id'];
    console.log('Available:', target.filter(c => columns.includes(c)).join(', '));
  })
  .catch(e => console.error(e.message))
  .finally(() => client.end());
