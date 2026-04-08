


import dotenv from "dotenv";
import pkg from "pg";
import { Sequelize } from "sequelize";

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // required for Neon
  },
});

// Compatibility export for legacy (Sequelize-based) controllers/routes that are still mounted.
// New code should prefer `pool` for direct SQL.
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false }
  }
});

const connectDb = async () => {
  // Keep this lightweight: verify both clients can connect.
  await pool.query("SELECT 1");
  await sequelize.authenticate();
};

export default pool;
export { sequelize, connectDb };