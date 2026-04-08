const notFound = (req, res, next) => {
  res.status(404).json({ error: `Not Found - ${req.originalUrl}` });
};

const errorHandler = (err, req, res, next) => {
  const statusCode =
    res.statusCode !== 200
      ? res.statusCode
      : Number(err?.statusCode) >= 400
        ? Number(err.statusCode)
        : 500;
  res.status(statusCode).json({
    error: err.message || "Internal server error",
    details: process.env.NODE_ENV === "production" ? undefined : err.stack
  });
};

export { notFound, errorHandler };
