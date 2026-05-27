const getPublicAppUrl = () => {
  const explicitUrl = process.env.FRONTEND_URL || process.env.APP_URL;
  if (explicitUrl) {
    return explicitUrl.replace(/\/+$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
};

export { getPublicAppUrl };