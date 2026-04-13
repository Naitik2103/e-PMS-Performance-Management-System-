const sendOtpEmail = async ({ email, otp, purpose }) => {
  // Fallback no-op mailer: logs OTP in server output for local/dev environments.
  // Replace with real SMTP provider integration when available.
  console.log(`[OTP:${purpose}] ${email} -> ${otp}`);
  return { ok: true };
};

export { sendOtpEmail };
