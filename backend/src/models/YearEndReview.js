const mongoose = require("mongoose");

const ratingSchema = new mongoose.Schema(
  {
    score: { type: Number, min: 0, max: 100 },
    scaleMax: { type: Number, default: 100 },
    comments: { type: String, trim: true }
  },
  { _id: false }
);

const yearEndReviewSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    year: { type: Number, required: true },
    status: {
      type: String,
      enum: ["draft", "submitted", "ro_rated", "review_approved", "accepted"],
      default: "draft"
    },
    selfSummary: { type: String, trim: true },
    roRating: ratingSchema,
    roRemarks: { type: String, trim: true },
    reviewingOfficerRemarks: { type: String, trim: true },
    acceptingOfficerRemarks: { type: String, trim: true },
    submittedAt: { type: Date },
    roRatedAt: { type: Date },
    reviewedAt: { type: Date },
    acceptedAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model("YearEndReview", yearEndReviewSchema);
