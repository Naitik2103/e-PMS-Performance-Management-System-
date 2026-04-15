import pool from "../config/db.js";

const notifyUser = async ({ userId, title, message, type, entity = null, entityId = null, senderId = null }) => {
  try {
    const recipientId = userId;
    
    // Fetch recipient's email
    const { rows: recipientRows } = await pool.query(
      "SELECT email FROM users WHERE user_id = $1 LIMIT 1",
      [recipientId]
    );
    const recipientEmail = recipientRows[0]?.email;
    
    if (!recipientEmail) {
      console.warn(`No email found for user ${recipientId}, skipping notification`);
      return;
    }
    
    await pool.query(
      `
      INSERT INTO notifications
        (recipient_id, recipient_email, sender_id, type, subject, body_content, entity_type, entity_id, status, send_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, 'unread', NOW())
      `,
      [recipientId, recipientEmail, senderId, type, title, message, entity, entityId]
    );
  } catch (error) {
    console.error("Error sending notification:", error.message);
    throw error;
  }
};

export { notifyUser };
