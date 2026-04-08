import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";

import authRoutesV2 from "./routes/auth.js";
import userRoutes from "./routes/userRoutes.js";
import adminRoutesV2 from "./routes/admin.js";
import goalsRoutesV2 from "./routes/goals.js";
import trackingRoutes from "./routes/trackingRoutes.js";
import sixMonthRoutesV2 from "./routes/sixMonthReview.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import selfAppraisalRoutes from "./routes/selfAppraisal.js";
import ratingsRoutes from "./routes/ratings.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import appraisalRoutes from "./routes/appraisalRoutes.js";
import pool from "./config/db.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "e-PMS API" });
});

app.use("/api/auth", authRoutesV2);
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutesV2);
app.use("/api/goals", goalsRoutesV2);
app.use("/api/tracking", trackingRoutes);
app.use("/api/six-month-review", sixMonthRoutesV2);
app.use("/api/reviews", reviewRoutes);
app.use("/api/self-appraisal", selfAppraisalRoutes);
app.use("/api/ratings", ratingsRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/appraisals", appraisalRoutes);

/**
 * No-ORM mode (Neon/pg direct):
 * We keep the server stable by mounting only SQL-migrated modules.
 * Remaining modules will be mounted as 501 placeholders until migrated.
 */
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/health/db", async (req, res, next) => {
  try {
    const result = await pool.query("SELECT NOW() as now");
    return res.json({ status: "ok", db: "connected", now: result.rows?.[0]?.now });
  } catch (error) {
    return next(error);
  }
});

// Note: authz is enforced within each router via `protect` + `authorise(...)`.

app.use(notFound);
app.use(errorHandler);

export default app;
