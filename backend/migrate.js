import dotenv from "dotenv";
import migrate from "./src/migrations/add_status_to_six_month_review.js";
import pool from "./src/config/db.js";

dotenv.config();

const runMigration = async () => {
  try {
    await migrate();
    console.log("\n✓ All migrations completed!");
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("\n✗ Migration error:", error);
    await pool.end();
    process.exit(1);
  }
};

runMigration();
