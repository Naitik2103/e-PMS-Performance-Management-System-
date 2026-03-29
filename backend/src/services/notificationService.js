const { Notification } = require("../models");

const notifyUser = async ({ userId, title, message, type, entity = null, entityId = null, transaction = undefined }) => {
  return Notification.create(
    {
      userId,
      title,
      message,
      type,
      entity,
      entityId
    },
    { transaction }
  );
};

module.exports = { notifyUser };
