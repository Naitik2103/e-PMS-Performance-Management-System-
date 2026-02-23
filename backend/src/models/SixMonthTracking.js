const mongoose = require("mongoose");

const progressSchema = new mongoose.Schema(
  {
    kpaTitle: { type: String, required: true, trim: true },
    progress: { type: String, required: true, trim: true },
    updatedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const trackingSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    goal: { type: mongoose.Schema.Types.ObjectId, ref: "Goal", required: true },
    year: { type: Number, required: true },
    period: { type: String, enum: ["H1", "H2"], required: true },
    status: { type: String, enum: ["open", "ro_remarked", "closed"], default: "open" },
    progressEntries: { type: [progressSchema], default: [] },
    roRemarks: { type: String, trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("SixMonthTracking", trackingSchema);
