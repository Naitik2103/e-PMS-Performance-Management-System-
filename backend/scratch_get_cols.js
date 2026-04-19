import pool from "./src/config/db.js";

async function run() {
  const getCols = async (t) => {
    const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = $1", [t]);
    return r.rows.map(x => x.column_name);
  };
  try {
    console.log("master:", await getCols("quantitative_attributes_master"));
    console.log("rating:", await getCols("quantitative_attribute_rating"));
    console.log("score_summary:", await getCols("score_summary"));
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
