const { Op } = require("sequelize");
const {
  AnnualSelfAppraisal,
  AppraisalCycle,
  Goal,
  SelfAppraisalGoalRating,
  PerformanceReview,
  QuantitativeAttributeMaster,
  QuantitativeAttributeRating,
  User
} = require("../models");
const { writeAudit } = require("../services/auditService");
const { notifyUser } = require("../services/notificationService");
const { getRoleFinalScore, average } = require("../services/scoreService");

const ensureCycle = async (cycleId, year) => {
  if (cycleId) return AppraisalCycle.findByPk(cycleId);
  if (year) {
    return AppraisalCycle.findOne({ where: { year }, order: [["createdAt", "DESC"]] });
  }
  return AppraisalCycle.findOne({ where: { isActive: true } });
};

const upsertAttributeRatings = async ({ reviewId, userId, role, ratings = [] }) => {
  for (const item of ratings) {
    await QuantitativeAttributeRating.upsert({
      reviewId,
      attributeId: item.attributeId,
      ratedBy: userId,
      ratedByRole: role,
      rating: item.rating,
      remarks: item.remarks || null
    });
  }
};

const ensureSelfAppraisalGoalRatings = async (selfAppraisalId, goals, providedRatings = []) => {
  const byGoal = new Map((providedRatings || []).map((r) => [r.goalId, r]));
  for (const goal of goals) {
    const item = byGoal.get(goal.id);
    await SelfAppraisalGoalRating.upsert({
      selfAppraisalId,
      goalId: goal.id,
      achievementText: item?.achievementText || "",
      selfRating: item?.selfRating || 3
    });
  }
};

const submitSelfSummary = async (req, res, next) => {
  try {
    const { cycleId, year, selfSummary, goalRatings } = req.body;
    const cycle = await ensureCycle(cycleId, year);
    if (!cycle) {
      res.status(400);
      return next(new Error("Appraisal cycle not found"));
    }

    const goals = await Goal.findAll({ where: { userId: req.user.id, cycleId: cycle.id, status: { [Op.in]: ["approved", "submitted"] } } });
    if (!goals.length) {
      res.status(400);
      return next(new Error("Please submit goals before self-appraisal"));
    }

    const [selfAppraisal] = await AnnualSelfAppraisal.findOrCreate({
      where: { employeeId: req.user.id, cycleId: cycle.id },
      defaults: { selfSummary, status: "submitted", submittedAt: new Date() }
    });

    selfAppraisal.selfSummary = selfSummary;
    selfAppraisal.status = "submitted";
    selfAppraisal.submittedAt = new Date();
    await selfAppraisal.save();

    await ensureSelfAppraisalGoalRatings(selfAppraisal.id, goals, goalRatings || []);

    const [review] = await PerformanceReview.findOrCreate({
      where: { employeeId: req.user.id, cycleId: cycle.id },
      defaults: {
        selfAppraisalId: selfAppraisal.id,
        status: "pending_ro"
      }
    });
    if (review.status === "returned") {
      review.status = "pending_ro";
      await review.save();
    }

    const employee = await User.findByPk(req.user.id, { attributes: ["name", "reportingTo"] });
    if (employee?.reportingTo) {
      await notifyUser({
        userId: employee.reportingTo,
        title: "Self-Appraisal Pending",
        message: `${employee.name} submitted self-appraisal for ${cycle.name}`,
        type: "self_appraisal_submission",
        entity: "performance_review",
        entityId: review.id
      });
    }

    await writeAudit({ user: req.user, action: "submit", entity: "self_appraisal", entityId: selfAppraisal.id });

    return res.json({ selfAppraisal, review });
  } catch (error) {
    return next(error);
  }
};

const rateByRO = async (req, res, next) => {
  try {
    const { reviewId, score, remarks, attributeRatings = [] } = req.body;
    const review = await PerformanceReview.findByPk(reviewId, {
      include: [{ model: User, as: "employee", attributes: ["id", "name", "reportingTo"] }]
    });

    if (!review) {
      res.status(404);
      return next(new Error("Review not found"));
    }
    if (review.status !== "pending_ro") {
      res.status(400);
      return next(new Error("RO cannot rate before employee submission"));
    }
    if (review.employee.reportingTo !== req.user.id) {
      res.status(403);
      return next(new Error("Access denied for this review"));
    }

    const goalRatings = await SelfAppraisalGoalRating.findAll({ where: { selfAppraisalId: review.selfAppraisalId } });
    for (const item of goalRatings) {
      item.roRating = Number(score || 0);
      await item.save();
    }

    await upsertAttributeRatings({
      reviewId: review.id,
      userId: req.user.id,
      role: "ReportingOfficer",
      ratings: attributeRatings
    });

    review.roRemarks = remarks || null;
    review.roReviewedAt = new Date();
    review.status = "pending_revo";
    review.roScore = await getRoleFinalScore({
      reviewId: review.id,
      selfAppraisalId: review.selfAppraisalId,
      cycleId: review.cycleId,
      ratedByRole: "ReportingOfficer"
    });
    await review.save();

    const ro = await User.findByPk(req.user.id, { attributes: ["reportingTo"] });
    if (ro?.reportingTo) {
      await notifyUser({
        userId: ro.reportingTo,
        title: "Review Pending at Reviewing Officer",
        message: `${review.employee.name} appraisal is pending your review.`,
        type: "review_pending",
        entity: "performance_review",
        entityId: review.id
      });
    }

    await writeAudit({ user: req.user, action: "approve", entity: "performance_review", entityId: review.id });
    return res.json(review);
  } catch (error) {
    return next(error);
  }
};

const reviewByReviewing = async (req, res, next) => {
  try {
    const { reviewId, score, remarks, attributeRatings = [] } = req.body;
    const review = await PerformanceReview.findByPk(reviewId, {
      include: [{ model: User, as: "employee", attributes: ["id", "name", "reportingTo"] }]
    });
    if (!review) {
      res.status(404);
      return next(new Error("Review not found"));
    }
    if (review.status !== "pending_revo") {
      res.status(400);
      return next(new Error("RevO cannot review before RO"));
    }

    const ro = await User.findByPk(review.employee.reportingTo, { attributes: ["id", "reportingTo"] });
    if (!ro || ro.reportingTo !== req.user.id) {
      res.status(403);
      return next(new Error("Access denied for this review"));
    }

    const goalRatings = await SelfAppraisalGoalRating.findAll({ where: { selfAppraisalId: review.selfAppraisalId } });
    for (const item of goalRatings) {
      item.revoRating = Number(score || item.roRating || 0);
      await item.save();
    }

    await upsertAttributeRatings({
      reviewId: review.id,
      userId: req.user.id,
      role: "ReviewingOfficer",
      ratings: attributeRatings
    });

    review.revoRemarks = remarks || null;
    review.revoReviewedAt = new Date();
    review.status = "pending_ao";
    review.revoScore = await getRoleFinalScore({
      reviewId: review.id,
      selfAppraisalId: review.selfAppraisalId,
      cycleId: review.cycleId,
      ratedByRole: "ReviewingOfficer"
    });
    await review.save();

    const aos = await User.findAll({ where: { role: "AcceptingOfficer", isActive: true }, attributes: ["id"] });
    for (const ao of aos) {
      await notifyUser({
        userId: ao.id,
        title: "Final Approval Required",
        message: `${review.employee.name} appraisal is pending final approval.`,
        type: "review_pending",
        entity: "performance_review",
        entityId: review.id
      });
    }

    await writeAudit({ user: req.user, action: "approve", entity: "performance_review", entityId: review.id });
    return res.json(review);
  } catch (error) {
    return next(error);
  }
};

const acceptByAccepting = async (req, res, next) => {
  try {
    const { reviewId, score, remarks, attributeRatings = [] } = req.body;
    const review = await PerformanceReview.findByPk(reviewId, {
      include: [{ model: User, as: "employee", attributes: ["id", "name"] }]
    });
    if (!review) {
      res.status(404);
      return next(new Error("Review not found"));
    }
    if (review.status !== "pending_ao") {
      res.status(400);
      return next(new Error("AO cannot finalize before RevO"));
    }

    const goalRatings = await SelfAppraisalGoalRating.findAll({ where: { selfAppraisalId: review.selfAppraisalId } });
    for (const item of goalRatings) {
      item.aoRating = Number(score || item.revoRating || item.roRating || 0);
      await item.save();
    }

    await upsertAttributeRatings({
      reviewId: review.id,
      userId: req.user.id,
      role: "AcceptingOfficer",
      ratings: attributeRatings
    });

    review.aoRemarks = remarks || null;
    review.aoReviewedAt = new Date();
    review.status = "finalized";
    review.aoScore = await getRoleFinalScore({
      reviewId: review.id,
      selfAppraisalId: review.selfAppraisalId,
      cycleId: review.cycleId,
      ratedByRole: "AcceptingOfficer"
    });
    review.finalScore = average([review.roScore, review.revoScore, review.aoScore]);
    await review.save();

    await AnnualSelfAppraisal.update({ status: "ao_finalized" }, { where: { id: review.selfAppraisalId } });

    await notifyUser({
      userId: review.employeeId,
      title: "Appraisal Finalized",
      message: `Your appraisal has been finalized with score ${Number(review.finalScore).toFixed(2)}.`,
      type: "review_finalized",
      entity: "performance_review",
      entityId: review.id
    });

    await writeAudit({ user: req.user, action: "approve", entity: "performance_review", entityId: review.id, details: { finalScore: review.finalScore } });
    return res.json(review);
  } catch (error) {
    return next(error);
  }
};

const listMyReviews = async (req, res, next) => {
  try {
    const reviews = await PerformanceReview.findAll({
      where: { employeeId: req.user.id },
      include: [{ model: AppraisalCycle, as: "cycle" }],
      order: [["createdAt", "DESC"]]
    });
    return res.json(reviews);
  } catch (error) {
    return next(error);
  }
};

const listQueue = async (req, res, next) => {
  try {
    if (req.user.role === "Admin") {
      const reviews = await PerformanceReview.findAll({ include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }, { model: AppraisalCycle, as: "cycle" }] });
      return res.json(reviews);
    }

    if (req.user.role === "ReportingOfficer") {
      const reports = await User.findAll({ where: { reportingTo: req.user.id }, attributes: ["id"] });
      const reviewDocs = await PerformanceReview.findAll({
        where: { employeeId: reports.map((r) => r.id), status: "pending_ro" },
        include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }, { model: AppraisalCycle, as: "cycle" }]
      });
      return res.json(reviewDocs);
    }

    if (req.user.role === "ReviewingOfficer") {
      const ros = await User.findAll({ where: { reportingTo: req.user.id, role: "ReportingOfficer" }, attributes: ["id"] });
      const employees = await User.findAll({ where: { reportingTo: ros.map((r) => r.id) }, attributes: ["id"] });
      const reviewDocs = await PerformanceReview.findAll({
        where: { employeeId: employees.map((u) => u.id), status: "pending_revo" },
        include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }, { model: AppraisalCycle, as: "cycle" }]
      });
      return res.json(reviewDocs);
    }

    if (req.user.role === "AcceptingOfficer") {
      const reviewDocs = await PerformanceReview.findAll({
        where: { status: "pending_ao" },
        include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }, { model: AppraisalCycle, as: "cycle" }]
      });
      return res.json(reviewDocs);
    }

    return res.json([]);
  } catch (error) {
    return next(error);
  }
};

const listAttributeMasters = async (req, res, next) => {
  try {
    const items = await QuantitativeAttributeMaster.findAll({ where: { isActive: true }, order: [["category", "ASC"], ["attributeName", "ASC"]] });
    return res.json(items);
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
  listQueue,
  listAttributeMasters
};
