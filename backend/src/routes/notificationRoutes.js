import express from "express";
import { listMyNotifications, unreadCount, markAsRead } from "../controllers/notificationController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);
router.get("/", listMyNotifications);
router.get("/unread-count", unreadCount);
router.patch("/:id/read", markAsRead);

export default router;
