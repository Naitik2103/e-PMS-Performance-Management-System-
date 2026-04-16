


import dotenv from "dotenv";
import pkg from "pg";
import { Sequelize } from "sequelize";

dotenv.config();

const { Pool } = pkg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "Missing DATABASE_URL. Create backend/.env and set DATABASE_URL to your Postgres connection string."
  );
}

// Most managed Postgres providers (e.g. Neon) require SSL. Local Postgres usually doesn't.
const useSsl =
  (process.env.DB_SSL ?? "").toLowerCase() === "true" ||
  (process.env.PGSSLMODE ?? "").toLowerCase() === "require";

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

// Prevent process crash on transient idle client disconnects (common on managed Postgres).
pool.on("error", (err) => {
  console.error("Postgres pool idle client error:", err?.message || err);
});

// Compatibility export for legacy (Sequelize-based) controllers/routes that are still mounted.
// New code should prefer `pool` for direct SQL.
const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: false,
  dialectOptions: useSsl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
});

const connectDb = async () => {
  // Keep this lightweight: verify both clients can connect.
  await pool.query("SELECT 1");
  await sequelize.authenticate();
};

export default pool;
export { sequelize, connectDb };