import pool from "../config/db.js";

const migrate = async () => {
  try {
    console.log("Starting migration: Add status column to six_month_review...");

    // Check if column exists
    const checkRes = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'six_month_review' AND column_name = 'status'
    `);

    if (checkRes.rows.length > 0) {
      console.log("✓ Column 'status' already exists in six_month_review table");
      return;
    }

    // Add status column
    await pool.query(`
      ALTER TABLE six_month_review 
      ADD COLUMN status VARCHAR(50) DEFAULT 'draft' NOT NULL
    `);
    console.log("✓ Added 'status' column with default value 'draft'");

    // Update submittedAt to be nullable
    await pool.query(`
      ALTER TABLE six_month_review 
      ALTER COLUMN submitted_at DROP NOT NULL
    `);
    console.log("✓ Updated 'submitted_at' to allow NULL values");

    console.log("✓ Migration completed successfully!");
  } catch (error) {
    console.error("✗ Migration failed:", error.message);
    throw error;
  }
};

export default migrate;
