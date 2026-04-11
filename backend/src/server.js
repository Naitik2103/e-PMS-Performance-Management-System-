
import app from "./app.js";
import pool from "./config/db.js";
import { ensureAdminSchema } from "./db/ensureAdminSchema.js";

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await ensureAdminSchema(pool);
    // Bootstrap minimal schema for no-ORM mode (Neon/pg direct)
    // Your Neon DB already contains a `users` table (PK is `user_id`), so we only create
    // the session table if it's missing.
    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        token_id text UNIQUE NOT NULL,
        expires_at timestamptz NOT NULL,
        is_revoked boolean NOT NULL DEFAULT false,
        revoked_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);

    // Ensure the default admin exists (for UI login testing)
    const adminExists = await pool.query("SELECT 1 FROM users WHERE LOWER(email) = 'admin@epms.local' LIMIT 1");
    const bcrypt = (await import("bcryptjs")).default;
    const hash = await bcrypt.hash("Password123!", 10);

    const ensureDept = async (name, code) => {
      const r = await pool.query("SELECT id FROM departments WHERE name = $1 LIMIT 1", [name]);
      if (r.rows[0]?.id) return r.rows[0].id;
      const created = await pool.query(
        "INSERT INTO departments (name, code, is_active) VALUES ($1,$2,true) RETURNING id",
        [name, code]
      );
      return created.rows[0].id;
    };

    const adminDeptId = await ensureDept("Administration", "ADMIN");
    const csDeptId = await ensureDept("Computer Science", "CS");
    const coDeptId = await ensureDept("Central Office", "CO");

    const ensureUser = async ({ first, last, email, role, deptId, reportingTo = null }) => {
      const exists = await pool.query("SELECT user_id FROM users WHERE LOWER(email) = $1 LIMIT 1", [email.toLowerCase()]);
      if (exists.rows.length) {
        if (reportingTo) {
          await pool.query("UPDATE users SET reporting_to = $1, updated_at = NOW() WHERE user_id = $2", [reportingTo, exists.rows[0].user_id]);
        }
        return exists.rows[0].user_id;
      }
      const inserted = await pool.query(
        "INSERT INTO users (first_name, last_name, email, password_hash, role, department_id, reporting_to, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING user_id",
        [first, last, email.toLowerCase(), hash, role, deptId, reportingTo]
      );
      return inserted.rows[0].user_id;
    };

    const adminId = await ensureUser({ first: "System", last: "Admin", email: "admin@epms.local", role: "hr_admin", deptId: adminDeptId });
    const aoId = await ensureUser({ first: "Ava", last: "Accept", email: "accepting@epms.local", role: "accepting_officer", deptId: coDeptId });
    const revoId = await ensureUser({ first: "Riya", last: "Review", email: "reviewing@epms.local", role: "reviewing_officer", deptId: coDeptId, reportingTo: aoId });
    const roId = await ensureUser({ first: "Rohan", last: "Report", email: "reporting@epms.local", role: "reporting_officer", deptId: csDeptId, reportingTo: revoId });
    const empId = await ensureUser({ first: "Emma", last: "Employee", email: "employee@epms.local", role: "employee", deptId: csDeptId, reportingTo: roId });

    // Optional: link RO/RevO/AO relationships on users table columns used elsewhere (ro_id/rew_id/ao_id)
    await pool.query("UPDATE users SET ro_id = $1, rew_id = $2, ao_id = $3 WHERE user_id = $4", [roId, revoId, aoId, empId]);

    await pool.query("SELECT 1"); // test DB connection

    console.log("Database connected");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to Postgres", error);
    process.exit(1);
  }
})();