import pool from "../config/db.js";

const notifyUser = async ({ userId, title, message, type, entity = null, entityId = null, senderId = null }) => {
  const recipientId = userId;
  await pool.query(
    `
    INSERT INTO notifications
      (recipient_id, sender_id, type, subject, body_content, entity_type, entity_id, status, send_at)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, 'unread', NOW())
    `,
    [recipientId, senderId, type, title, message, entity, entityId]
  );
};

export { notifyUser };
