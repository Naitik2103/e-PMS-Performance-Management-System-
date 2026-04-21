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
    WHERE closed_at IS NOT NULL AND (status IS NULL OR status::text = '')
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

  const { rows: appraisalExists } = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'appraisals') AS ok`
  );
  if (appraisalExists[0]?.ok) {
    // Appraisals can exist before RevO/AO assignments are configured in the cycle participants table.
    await pool.query(`ALTER TABLE appraisals ALTER COLUMN revo_id DROP NOT NULL`);
    await pool.query(`ALTER TABLE appraisals ALTER COLUMN ao_id DROP NOT NULL`);
  }

  // Unified per-goal appraisal ratings table (RO/RevO/AO + remarks).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appraisal_ratings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      appraisal_id uuid NOT NULL REFERENCES appraisals(id) ON DELETE CASCADE,
      goal_id uuid NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
      achievement_text text NULL,
      self_rating integer NULL,
      ro_rating integer NULL,
      ro_remarks text NULL,
      revo_rating integer NULL,
      revo_remarks text NULL,
      ao_rating integer NULL,
      ao_remarks text NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE (appraisal_id, goal_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_appraisal_ratings_appraisal
    ON appraisal_ratings(appraisal_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_appraisal_ratings_goal
    ON appraisal_ratings(goal_id)
  `);

  const { rows: oldGoalRatingsExists } = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'appraisal_goal_ratings') AS ok`
  );

  if (oldGoalRatingsExists[0]?.ok) {
    const { rows: newRatingColsRows } = await pool.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'appraisal_ratings'
      `
    );
    const newRatingCols = new Set(newRatingColsRows.map((r) => r.column_name));

    const requiresNewShape = [
      "achievement_text",
      "self_rating",
      "ro_rating",
      "ro_remarks",
      "revo_rating",
      "revo_remarks",
      "ao_rating",
      "ao_remarks",
      "updated_at"
    ];

    const compatible = requiresNewShape.every((c) => newRatingCols.has(c));

    if (compatible) {
      await pool.query(`
        INSERT INTO appraisal_ratings (
          id,
          appraisal_id,
          goal_id,
          achievement_text,
          self_rating,
          ro_rating,
          ro_remarks,
          revo_rating,
          revo_remarks,
          ao_rating,
          ao_remarks,
          created_at,
          updated_at
        )
        SELECT
          COALESCE(ogr.id, gen_random_uuid()),
          ogr.appraisal_id,
          ogr.goal_id,
          ogr.achievement_text,
          ogr.self_rating,
          ogr.ro_rating,
          ogr.ro_remarks,
          ogr.revo_rating,
          ogr.revo_remarks,
          ogr.ao_rating,
          ogr.ao_remarks,
          COALESCE(ogr.created_at, NOW()),
          COALESCE(ogr.updated_at, NOW())
        FROM appraisal_goal_ratings ogr
        ON CONFLICT (appraisal_id, goal_id)
        DO UPDATE SET
          achievement_text = COALESCE(EXCLUDED.achievement_text, appraisal_ratings.achievement_text),
          self_rating = COALESCE(EXCLUDED.self_rating, appraisal_ratings.self_rating),
          ro_rating = COALESCE(EXCLUDED.ro_rating, appraisal_ratings.ro_rating),
          ro_remarks = COALESCE(EXCLUDED.ro_remarks, appraisal_ratings.ro_remarks),
          revo_rating = COALESCE(EXCLUDED.revo_rating, appraisal_ratings.revo_rating),
          revo_remarks = COALESCE(EXCLUDED.revo_remarks, appraisal_ratings.revo_remarks),
          ao_rating = COALESCE(EXCLUDED.ao_rating, appraisal_ratings.ao_rating),
          ao_remarks = COALESCE(EXCLUDED.ao_remarks, appraisal_ratings.ao_remarks),
          updated_at = GREATEST(appraisal_ratings.updated_at, EXCLUDED.updated_at)
      `);

      // Remove legacy table only after successful migration into compatible schema.
      await pool.query(`DROP TABLE IF EXISTS appraisal_goal_ratings CASCADE`);
    } else {
      console.warn(
        "Skipping appraisal_goal_ratings migration: appraisal_ratings table uses a legacy/incompatible column set."
      );
    }
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

  // Create six_month_review table if it doesn't exist
  const { rows: sixMonthExists } = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'six_month_review') AS ok`
  );
  if (!sixMonthExists[0]?.ok) {
    await pool.query(`
      CREATE TABLE six_month_review (
        review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        goal_id uuid NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
        cycle_id uuid NOT NULL REFERENCES appraisal_cycles(cycle_id) ON DELETE CASCADE,
        period VARCHAR(10) NOT NULL DEFAULT 'H1',
        progress_text text NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'draft',
        reporting_remarks text NULL,
        submitted_at timestamptz NULL,
        remarked_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        UNIQUE (employee_id, goal_id, cycle_id, period)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_six_month_employee ON six_month_review(employee_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_six_month_cycle ON six_month_review(cycle_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_six_month_status ON six_month_review(status)`);
  } else {
    // Ensure status column exists with default 'draft'
    const { rows: cols } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'six_month_review'`
    );
    const colSet = new Set(cols.map((r) => r.column_name));
    if (!colSet.has('status')) {
      await pool.query(`ALTER TABLE six_month_review ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'draft'`);
    }
    if (colSet.has('submitted_at') && !colSet.has('period')) {
      await pool.query(`ALTER TABLE six_month_review ADD COLUMN period VARCHAR(10) NOT NULL DEFAULT 'H1'`);
    }
    // Make submitted_at nullable if needed
    const { rows: submitCol } = await pool.query(
      `SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'six_month_review' AND column_name = 'submitted_at'`
    );
    if (submitCol[0]?.is_nullable === 'NO') {
      await pool.query(`ALTER TABLE six_month_review ALTER COLUMN submitted_at DROP NOT NULL`);
    }
  // ── Per-rater score breakdown columns in score_summary ───────────────────────
  // 5 sub-scores × 3 roles = 15 new columns.  ADD COLUMN IF NOT EXISTS is safe
  // to run on every server start (idempotent).
  const perRaterCols = [
    "ro_kpa_score",
    "ro_values_avg",
    "ro_competencies_avg",
    "ro_personal_avg",
    "ro_knowledge_avg",
    "revo_kpa_score",
    "revo_values_avg",
    "revo_competencies_avg",
    "revo_personal_avg",
    "revo_knowledge_avg",
    "ao_kpa_score",
    "ao_values_avg",
    "ao_competencies_avg",
    "ao_personal_avg",
    "ao_knowledge_avg",
  ];
  for (const col of perRaterCols) {
    await pool.query(
      `ALTER TABLE score_summary ADD COLUMN IF NOT EXISTS ${col} numeric NULL`
    );
  }
};

export { ensureAdminSchema };
