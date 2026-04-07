import { AuditLog } from "../models.js";

const writeAudit = async ({ user, action, entity, entityId = null, details = null, transaction = undefined }) => {
  return AuditLog.create(
    {
      userId: user?.id || null,
      role: user?.role || null,
      action,
      entity,
      entityId,
      details
    },
    { transaction }
  );
};

export { writeAudit };
