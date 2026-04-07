import { AuditLog } from "../models.js";

const logAction = async ({
  actorId,
  action,
  targetTable,
  targetId,
  metadata = {},
  transaction
}) => {
  return AuditLog.create(
    {
      userId: actorId || null,
      role: metadata?.actorRole || null,
      action,
      entity: targetTable,
      entityId: targetId || null,
      details: metadata
    },
    transaction ? { transaction } : undefined
  );
};

export { logAction };
