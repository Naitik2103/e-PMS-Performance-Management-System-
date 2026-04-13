import crypto from "crypto";
import pool from "../config/db.js";

const OTP_PURPOSES = Object.freeze({
  FORGOT_PASSWORD: "forgot_password",
  EMAIL_VERIFICATION: "email_verification"
});

const hashOtp = (otp) => crypto.createHash("sha256").update(String(otp)).digest("hex");
const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const createOtpForUser = async ({ userId, purpose, expiresInMinutes = 10 }) => {
  const otp = generateOtp();
  const token = hashOtp(otp);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  await pool.query(
    `
    INSERT INTO password_reset_tokens (id, user_id, token, expires_at, used_at, created_at)
    VALUES (gen_random_uuid(), $1, $2, $3, NULL, NOW())
    `,
    [userId, token, expiresAt]
  );

  return { otp, expiresAt, purpose };
};

const verifyOtpForUser = async ({ userId, otp }) => {
  const token = hashOtp(otp);
  const { rows } = await pool.query(
    `
    SELECT id, user_id, token, expires_at, used_at
    FROM password_reset_tokens
    WHERE user_id = $1 AND token = $2
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId, token]
  );

  const row = rows[0];
  if (!row) return { valid: false, reason: "invalid" };
  if (row.used_at) return { valid: false, reason: "used" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { valid: false, reason: "expired" };

  return { valid: true, tokenId: row.id };
};

const consumeOtp = async ({ tokenId }) => {
  await pool.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [tokenId]);
};

export { OTP_PURPOSES, createOtpForUser, verifyOtpForUser, consumeOtp };
