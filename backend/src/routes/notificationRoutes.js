const express = require("express");
const { listMyNotifications, unreadCount, markAsRead } = require("../controllers/notificationController");
const { protect } = require("../middleware/auth");

const router = express.Router();

router.use(protect);
router.get("/", listMyNotifications);
router.get("/unread-count", unreadCount);
router.patch("/:id/read", markAsRead);

module.exports = router;
