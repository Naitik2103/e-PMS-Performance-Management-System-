const { YearEndReview, User } = require("../models");

const submitSelfSummary = async (req, res, next) => {
  try {
    const { year, selfSummary } = req.body;
    let review = await YearEndReview.findOne({ where: { employeeId: req.user.id, year } });
    if (!review) {
      review = await YearEndReview.create({ employeeId: req.user.id, year });
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
    const review = await YearEndReview.findByPk(reviewId, {
      include: [{ model: User, as: "employee", attributes: ["id", "reportingTo"] }]
    });
    if (!review) {
      res.status(404);
      return next(new Error("Review not found"));
    }

    if (review.employee.reportingTo !== req.user.id) {
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
    const review = await YearEndReview.findByPk(reviewId, {
      include: [{ model: User, as: "employee", attributes: ["id", "reportingTo"] }]
    });
    if (!review) {
      res.status(404);
      return next(new Error("Review not found"));
    }
    if (review.status !== "ro_rated") {
      res.status(400);
      return next(new Error("Review is not ready for reviewing approval"));
    }

    const reportingOfficer = await User.findByPk(review.employee.reportingTo);
    if (!reportingOfficer || reportingOfficer.reportingTo !== req.user.id) {
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
    const review = await YearEndReview.findByPk(reviewId);
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
    const reviews = await YearEndReview.findAll({
      where: { employeeId: req.user.id },
      order: [["createdAt", "DESC"]]
    });
    return res.json(reviews);
  } catch (error) {
    return next(error);
  }
};

const listQueue = async (req, res, next) => {
  try {
    const role = req.user.role;
    if (role === "Admin") {
      const reviews = await YearEndReview.findAll({
        include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }]
      });
      return res.json(reviews);
    }

    if (role === "ReportingOfficer") {
      const reports = await User.findAll({ where: { reportingTo: req.user.id }, attributes: ["id"] });
      const reportIds = reports.map((report) => report.id);
      const reviewDocs = await YearEndReview.findAll({
        where: { employeeId: reportIds, status: "submitted" },
        include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }]
      });
      return res.json(reviewDocs);
    }

    if (role === "ReviewingOfficer") {
      const reportingOfficers = await User.findAll({
        where: { reportingTo: req.user.id, role: "ReportingOfficer" },
        attributes: ["id"]
      });
      const reportingOfficerIds = reportingOfficers.map((officer) => officer.id);
      const reportDocs = await User.findAll({ where: { reportingTo: reportingOfficerIds }, attributes: ["id"] });
      const reportIds = reportDocs.map((report) => report.id);
      const reviewDocs = await YearEndReview.findAll({
        where: { employeeId: reportIds, status: "ro_rated" },
        include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }]
      });
      return res.json(reviewDocs);
    }

    if (role === "AcceptingOfficer") {
      const reviewDocs = await YearEndReview.findAll({
        where: { status: "review_approved" },
        include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }]
      });
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
