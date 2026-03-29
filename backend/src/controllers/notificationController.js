const { Notification } = require("../models");

const listMyNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.findAll({
      where: { userId: req.user.id },
      order: [["createdAt", "DESC"]],
      limit: 100
    });
    return res.json(notifications);
  } catch (error) {
    return next(error);
  }
};

const unreadCount = async (req, res, next) => {
  try {
    const count = await Notification.count({ where: { userId: req.user.id, isRead: false } });
    return res.json({ count });
  } catch (error) {
    return next(error);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await Notification.findOne({ where: { id, userId: req.user.id } });
    if (!item) {
      res.status(404);
      return next(new Error("Notification not found"));
    }
    item.isRead = true;
    item.readAt = new Date();
    await item.save();
    return res.json(item);
  } catch (error) {
    return next(error);
  }
};

module.exports = { listMyNotifications, unreadCount, markAsRead };
