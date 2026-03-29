const { AuditLog } = require("../models");

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

module.exports = { writeAudit };
