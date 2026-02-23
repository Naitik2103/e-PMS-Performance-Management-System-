const YearEndReview = require("../models/YearEndReview");
const User = require("../models/User");

const submitSelfSummary = async (req, res, next) => {
  try {
    const { year, selfSummary } = req.body;
    let review = await YearEndReview.findOne({ employee: req.user._id, year });
    if (!review) {
      review = await YearEndReview.create({ employee: req.user._id, year });
    }

    review.selfSummary = selfSummary;
    review.status = "submitted";
    review.submittedAt = new Date();
    await review.save();

    return res.json(review);
  } catch (error) {
    return next(error);
  }
};

const rateByRO = async (req, res, next) => {
  try {
    const { reviewId, score, remarks } = req.body;
    const review = await YearEndReview.findById(reviewId).populate("employee", "reportingTo");
    if (!review) {
      res.status(404);
      return next(new Error("Review not found"));
    }

    if (review.employee.reportingTo?.toString() !== req.user._id.toString()) {
      res.status(403);
      return next(new Error("Access denied for this review"));
    }

    review.roRating = { score, scaleMax: 100, comments: remarks };
    review.roRemarks = remarks;
    review.status = "ro_rated";
    review.roRatedAt = new Date();
    await review.save();

    return res.json(review);
  } catch (error) {
    return next(error);
  }
};

const reviewByReviewing = async (req, res, next) => {
  try {
    const { reviewId, remarks } = req.body;
    const review = await YearEndReview.findById(reviewId).populate("employee", "reportingTo");
    if (!review) {
      res.status(404);
      return next(new Error("Review not found"));
    }
    if (review.status !== "ro_rated") {
      res.status(400);
      return next(new Error("Review is not ready for reviewing approval"));
    }

    const reportingOfficer = await User.findById(review.employee.reportingTo);
    if (!reportingOfficer || reportingOfficer.reportingTo?.toString() !== req.user._id.toString()) {
      res.status(403);
      return next(new Error("Access denied for this review"));
    }

    review.reviewingOfficerRemarks = remarks;
    review.status = "review_approved";
    review.reviewedAt = new Date();
    await review.save();

    return res.json(review);
  } catch (error) {
    return next(error);
  }
};

const acceptByAccepting = async (req, res, next) => {
  try {
    const { reviewId, remarks } = req.body;
    const review = await YearEndReview.findById(reviewId);
    if (!review) {
      res.status(404);
      return next(new Error("Review not found"));
    }
    if (review.status !== "review_approved") {
      res.status(400);
      return next(new Error("Review is not ready for acceptance"));
    }

    review.acceptingOfficerRemarks = remarks;
    review.status = "accepted";
    review.acceptedAt = new Date();
    await review.save();

    return res.json(review);
  } catch (error) {
    return next(error);
  }
};

const listMyReviews = async (req, res, next) => {
  try {
    const reviews = await YearEndReview.find({ employee: req.user._id }).sort({ createdAt: -1 });
    return res.json(reviews);
  } catch (error) {
    return next(error);
  }
};

const listQueue = async (req, res, next) => {
  try {
    const role = req.user.role;
    if (role === "Admin") {
      const reviews = await YearEndReview.find({}).populate("employee", "name department");
      return res.json(reviews);
    }

    if (role === "ReportingOfficer") {
      const reports = await User.find({ reportingTo: req.user._id }).select("_id");
      const reportIds = reports.map((report) => report._id);
      const reviewDocs = await YearEndReview.find({ employee: { $in: reportIds }, status: "submitted" })
        .populate("employee", "name department");
      return res.json(reviewDocs);
    }

    if (role === "ReviewingOfficer") {
      const reportingOfficers = await User.find({ reportingTo: req.user._id, role: "ReportingOfficer" }).select("_id");
      const reportingOfficerIds = reportingOfficers.map((officer) => officer._id);
      const reportDocs = await User.find({ reportingTo: { $in: reportingOfficerIds } }).select("_id");
      const reportIds = reportDocs.map((report) => report._id);
      const reviewDocs = await YearEndReview.find({ employee: { $in: reportIds }, status: "ro_rated" })
        .populate("employee", "name department");
      return res.json(reviewDocs);
    }

    if (role === "AcceptingOfficer") {
      const reviewDocs = await YearEndReview.find({ status: "review_approved" })
        .populate("employee", "name department");
      return res.json(reviewDocs);
    }

    return res.json([]);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  submitSelfSummary,
  rateByRO,
  reviewByReviewing,
  acceptByAccepting,
  listMyReviews,
  listQueue
};
