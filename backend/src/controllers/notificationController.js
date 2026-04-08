import pool from "../config/db.js";

const listMyNotifications = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const { rows } = await pool.query(
      `
      SELECT
        id,
        subject AS title,
        body_content AS message,
        (status = 'read') AS "isRead",
        NULL::timestamptz AS "readAt",
        send_at AS "createdAt",
        type,
        entity_type AS entity,
        entity_id AS "entityId"
      FROM notifications
      WHERE recipient_id = $1
      ORDER BY send_at DESC
      LIMIT 100
      `,
      [userId]
    );
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
};

const unreadCount = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const { rows } = await pool.query(
      "SELECT COUNT(1)::int AS count FROM notifications WHERE recipient_id = $1 AND status = 'unread'",
      [userId]
    );
    return res.json({ count: rows[0]?.count ?? 0 });
  } catch (error) {
    return next(error);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const { id } = req.params;
    const { rows } = await pool.query(
      `
      UPDATE notifications
      SET status = 'read'
      WHERE id = $1 AND recipient_id = $2
      RETURNING
        id,
        subject AS title,
        body_content AS message,
        (status = 'read') AS "isRead",
        NULL::timestamptz AS "readAt",
        send_at AS "createdAt",
        type,
        entity_type AS entity,
        entity_id AS "entityId"
      `,
      [id, userId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "Notification not found" });
    }
    return res.json(rows[0]);
  } catch (error) {
    return next(error);
  }
};

export { listMyNotifications, unreadCount, markAsRead };
