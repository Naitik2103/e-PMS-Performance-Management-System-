const mongoose = require("mongoose");

const kpaSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    weight: { type: Number, required: true, min: 0, max: 100 },
    measures: { type: String, trim: true }
  },
  { _id: false }
);

const goalSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    year: { type: Number, required: true },
    status: {
      type: String,
      enum: ["draft", "submitted", "ro_approved", "rev_approved"],
      default: "draft"
    },
    kpas: { type: [kpaSchema], default: [] },
    totalWeight: { type: Number, default: 0 },
    submittedAt: { type: Date },
    roApprovedAt: { type: Date },
    revApprovedAt: { type: Date },
    roApprover: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    revApprover: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

goalSchema.pre("save", function (next) {
  this.totalWeight = this.kpas.reduce((sum, kpa) => sum + (kpa.weight || 0), 0);
  next();
});

module.exports = mongoose.model("Goal", goalSchema);
