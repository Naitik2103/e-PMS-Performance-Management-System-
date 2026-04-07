import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";

import authRoutes from "./routes/authRoutes.js";
import authRoutesV2 from "./routes/auth.js";
import userRoutes from "./routes/userRoutes.js";
import goalRoutes from "./routes/goalRoutes.js";
import goalsRoutesV2 from "./routes/goals.js";
import trackingRoutes from "./routes/trackingRoutes.js";
import sixMonthRoutesV2 from "./routes/sixMonthReview.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import selfAppraisalRoutesV2 from "./routes/selfAppraisal.js";
import ratingsRoutesV2 from "./routes/ratings.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import adminRoutesV2 from "./routes/admin.js";
import appraisalRoutes from "./routes/appraisalRoutes.js";
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
app.use("/api/legacy/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/goals", goalsRoutesV2);
app.use("/api/legacy/goals", goalRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api/six-month-review", sixMonthRoutesV2);
app.use("/api/reviews", reviewRoutes);
app.use("/api/self-appraisal", selfAppraisalRoutesV2);
app.use("/api/ratings", ratingsRoutesV2);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutesV2);
app.use("/api/legacy/admin", adminRoutes);
app.use("/api/appraisals", appraisalRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
