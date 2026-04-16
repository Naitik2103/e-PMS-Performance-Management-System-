/**
 * Idempotent schema extensions for HR admin APIs (pg direct).
 * Safe to run on every server start.
 */
const ensureAdminSchema = async (pool) => {
  await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS designations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      grade_level int NULL,
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name text`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id text`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS designation_id uuid REFERENCES designations(id)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reporting_to uuid REFERENCES users(user_id)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS org_level integer NOT NULL DEFAULT 1`);
  await pool.query(
    `COMMENT ON COLUMN users.org_level IS 'APAR org level: 1=Faculty/Staff, 2=HOD/Lab Head, 3=Dean/School Head, 4=Director/Vice Chancellor'`
  );
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT NOW()`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW()`);

  // Backfill org-chart manager from legacy ro_id when available.
  await pool.query(`UPDATE users SET reporting_to = ro_id WHERE reporting_to IS NULL AND ro_id IS NOT NULL`);

  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS users_employee_id_unique ON users(employee_id) WHERE employee_id IS NOT NULL AND employee_id <> ''`
  );

  await pool.query(`ALTER TABLE appraisal_cycles ADD COLUMN IF NOT EXISTS status text`);
  await pool.query(`ALTER TABLE appraisal_cycles ADD COLUMN IF NOT EXISTS financial_year text`);
  await pool.query(`ALTER TABLE appraisal_cycles ADD COLUMN IF NOT EXISTS activated_at timestamptz`);
  await pool.query(`ALTER TABLE appraisal_cycles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW()`);

  await pool.query(`
    UPDATE appraisal_cycles
    SET status = 'closed'
    WHERE closed_at IS NOT NULL AND (status IS NULL OR status = '')
  `);
  // Legacy rows only: open cycle with no status yet → treat as active (one-time backfill).
  await pool.query(`
    UPDATE appraisal_cycles
    SET status = 'active', activated_at = COALESCE(activated_at, created_at, NOW())
    WHERE closed_at IS NULL AND status IS NULL
  `);

  const { rows: cycleCols } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'appraisal_cycles'`
  );
  const cycleColSet = new Set(cycleCols.map((r) => r.column_name));
  if (cycleColSet.has("cycle_year") && cycleColSet.has("financial_year")) {
    await pool.query(
      `UPDATE appraisal_cycles SET financial_year = COALESCE(financial_year, cycle_year::text) WHERE financial_year IS NULL`
    );
  }

  const { rows: pExists } = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'appraisal_cycle_participants') AS ok`
  );
  if (!pExists[0]?.ok) {
    await pool.query(`
      CREATE TABLE appraisal_cycle_participants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        cycle_id uuid NOT NULL REFERENCES appraisal_cycles(cycle_id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        reporting_officer_id uuid NULL REFERENCES users(user_id),
        reviewing_officer_id uuid NULL REFERENCES users(user_id),
        accepting_officer_id uuid NULL REFERENCES users(user_id),
        reviewing_officer_not_required boolean NOT NULL DEFAULT false,
        accepting_officer_not_required boolean NOT NULL DEFAULT false,
        reviewing_officer_not_required_reason text NULL,
        accepting_officer_not_required_reason text NULL,
        is_eligible boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        UNIQUE (cycle_id, employee_id)
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_acp_cycle ON appraisal_cycle_participants(cycle_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_acp_employee ON appraisal_cycle_participants(employee_id)`
    );
  } else {
    await pool.query(`ALTER TABLE appraisal_cycle_participants ADD COLUMN IF NOT EXISTS id uuid`);
    await pool.query(`ALTER TABLE appraisal_cycle_participants ADD COLUMN IF NOT EXISTS is_eligible boolean DEFAULT true`);
    await pool.query(
      `ALTER TABLE appraisal_cycle_participants ADD COLUMN IF NOT EXISTS reviewing_officer_not_required boolean NOT NULL DEFAULT false`
    );
    await pool.query(
      `ALTER TABLE appraisal_cycle_participants ADD COLUMN IF NOT EXISTS accepting_officer_not_required boolean NOT NULL DEFAULT false`
    );
    await pool.query(
      `ALTER TABLE appraisal_cycle_participants ADD COLUMN IF NOT EXISTS reviewing_officer_not_required_reason text`
    );
    await pool.query(
      `ALTER TABLE appraisal_cycle_participants ADD COLUMN IF NOT EXISTS accepting_officer_not_required_reason text`
    );
    await pool.query(`ALTER TABLE appraisal_cycle_participants ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT NOW()`);
    await pool.query(`ALTER TABLE appraisal_cycle_participants ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW()`);
    await pool.query(
      `UPDATE appraisal_cycle_participants SET id = gen_random_uuid() WHERE id IS NULL`
    );
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS appraisal_cycle_participants_id_uq ON appraisal_cycle_participants(id)`
    );
    // Keep officer assignments nullable: they are intentionally filled later from Manage Participants.
    await pool.query(`ALTER TABLE appraisal_cycle_participants ALTER COLUMN reporting_officer_id DROP NOT NULL`);
    await pool.query(`ALTER TABLE appraisal_cycle_participants ALTER COLUMN reviewing_officer_id DROP NOT NULL`);
    await pool.query(`ALTER TABLE appraisal_cycle_participants ALTER COLUMN accepting_officer_id DROP NOT NULL`);
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS appraisal_cycle_participants_cycle_employee_uq ON appraisal_cycle_participants(cycle_id, employee_id)`
    );
  }

  const { rows: seedDes } = await pool.query(`SELECT COUNT(1)::int AS c FROM designations`);
  if ((seedDes[0]?.c || 0) === 0) {
    await pool.query(`
      INSERT INTO designations (title, grade_level) VALUES
        ('Assistant Professor', 3),
        ('Associate Professor', 4),
        ('Professor', 5),
        ('Administrative Officer', 2)
    `);
  }

};

export { ensureAdminSchema };
