import pool from "../config/db.js";

const writeAudit = async ({ user, action, actionType = null, entity, entityId = null, details = null, description = null }) => {
  const actorId = user?.userId || user?.id || null;
  const actorRole = user?.role || null;
  const newValue = details ? JSON.stringify(details) : null;

  await pool.query(
    `
    INSERT INTO audit_log
      (actor_id, actor_role, action, action_type, entity_type, entity_id, new_value, description)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
    `,
    [actorId, actorRole, action, actionType || action, entity, entityId, newValue, description]
  );
};

export { writeAudit };
