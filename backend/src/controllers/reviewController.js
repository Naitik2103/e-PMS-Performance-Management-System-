import { Op } from "sequelize";
import {
  AnnualSelfAppraisal,
  AppraisalCycle,
  Goal,
  SelfAppraisalGoalRating,
  PerformanceReview,
  QuantitativeAttributeMaster,
  QuantitativeAttributeRating,
  User,
  sequelize
} from "../models.js";
import { writeAudit } from "../services/auditService.js";
import { notifyUser } from "../services/notificationService.js";
import { getRoleFinalScore, average } from "../services/scoreService.js";
import { ROLES, roleMatches } from "../constants/rbac.js";

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
    const { cycleId, year, selfSummary, goalRatings, reviewId } = req.body;
    let review = null;
    let cycle = null;
    if (reviewId) {
      review = await PerformanceReview.findByPk(reviewId);
      if (!review) return res.status(404).json({ error: "Appraisal not found" });
      if (review.employeeId !== req.user.userId) return res.status(403).json({ error: "This appraisal is not assigned to you" });
      if (review.status !== "ro_approved") {
        return res.status(409).json({ error: "Action not allowed in current appraisal state", required: "ro_approved", current: review.status });
      }
      cycle = await AppraisalCycle.findByPk(review.cycleId);
    } else {
      cycle = await ensureCycle(cycleId, year);
    }
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

    if (!review) {
      [review] = await PerformanceReview.findOrCreate({
        where: { employeeId: req.user.id, cycleId: cycle.id },
        defaults: { selfAppraisalId: selfAppraisal.id, status: "ro_approved" }
      });
    }
    review.selfAppraisalId = selfAppraisal.id;
    review.status = "self_appraisal_done";
    await review.save();

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
    if (review.status !== "self_appraisal_done") {
      return res.status(409).json({ error: "Action not allowed in current appraisal state", required: "self_appraisal_done", current: review.status });
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
      role: ROLES.REPORTING_OFFICER,
      ratings: attributeRatings
    });

    review.roRemarks = remarks || null;
    review.roReviewedAt = new Date();
    review.status = "ro_rated";
    review.roScore = await getRoleFinalScore({
      reviewId: review.id,
      selfAppraisalId: review.selfAppraisalId,
      cycleId: review.cycleId,
      ratedByRole: ROLES.REPORTING_OFFICER
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
    if (review.status !== "ro_rated") {
      return res.status(409).json({ error: "Action not allowed in current appraisal state", required: "ro_rated", current: review.status });
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
      role: ROLES.REVIEWING_OFFICER,
      ratings: attributeRatings
    });

    review.revoRemarks = remarks || null;
    review.revoReviewedAt = new Date();
    review.status = "revo_rated";
    review.revoScore = await getRoleFinalScore({
      reviewId: review.id,
      selfAppraisalId: review.selfAppraisalId,
      cycleId: review.cycleId,
      ratedByRole: ROLES.REVIEWING_OFFICER
    });
    await review.save();

    const aos = await User.findAll({
      where: { role: { [Op.in]: [ROLES.ACCEPTING_OFFICER, "AcceptingOfficer"] }, isActive: true },
      attributes: ["id"]
    });
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
    if (review.status !== "revo_rated") {
      return res.status(409).json({ error: "Action not allowed in current appraisal state", required: "revo_rated", current: review.status });
    }
    const tx = await sequelize.transaction();
    try {
      const goalRatings = await SelfAppraisalGoalRating.findAll({ where: { selfAppraisalId: review.selfAppraisalId }, transaction: tx });
      for (const item of goalRatings) {
        item.aoRating = Number(score || item.revoRating || item.roRating || 0);
        await item.save({ transaction: tx });
      }
      for (const item of attributeRatings) {
        await QuantitativeAttributeRating.upsert({
          reviewId: review.id,
          attributeId: item.attributeId,
          ratedBy: req.user.id,
          ratedByRole: ROLES.ACCEPTING_OFFICER,
          rating: item.rating,
          remarks: item.remarks || null
        }, { transaction: tx });
      }
      review.aoRemarks = remarks || null;
      review.aoReviewedAt = new Date();
      review.status = "ao_accepted";
      review.aoScore = await getRoleFinalScore({
        reviewId: review.id,
        selfAppraisalId: review.selfAppraisalId,
        cycleId: review.cycleId,
        ratedByRole: ROLES.ACCEPTING_OFFICER
      });
      review.finalScore = average([review.roScore, review.revoScore, review.aoScore]);
      await review.save({ transaction: tx });
      review.status = "completed";
      await review.save({ transaction: tx });
      await AnnualSelfAppraisal.update({ status: "ao_finalized" }, { where: { id: review.selfAppraisalId }, transaction: tx });
      await notifyUser({
        userId: review.employeeId,
        title: "Appraisal Finalized",
        message: `Your appraisal has been finalized with score ${Number(review.finalScore).toFixed(2)}.`,
        type: "review_finalized",
        entity: "performance_review",
        entityId: review.id
      });
      await writeAudit({ user: req.user, action: "appraisal_completed", entity: "performance_review", entityId: review.id, details: { finalScore: review.finalScore } });
      await tx.commit();
      return res.json(review);
    } catch (e) {
      await tx.rollback();
      throw e;
    }
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
    if (roleMatches(req.user.role, ROLES.HR_ADMIN)) {
      const reviews = await PerformanceReview.findAll({ include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }, { model: AppraisalCycle, as: "cycle" }] });
      return res.json(reviews);
    }

    if (roleMatches(req.user.role, ROLES.REPORTING_OFFICER)) {
      const reports = await User.findAll({ where: { reportingTo: req.user.id }, attributes: ["id"] });
      const reviewDocs = await PerformanceReview.findAll({
        where: { employeeId: reports.map((r) => r.id), status: "self_appraisal_done" },
        include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }, { model: AppraisalCycle, as: "cycle" }]
      });
      return res.json(reviewDocs);
    }

    if (roleMatches(req.user.role, ROLES.REVIEWING_OFFICER)) {
      const ros = await User.findAll({
        where: { reportingTo: req.user.id, role: { [Op.in]: [ROLES.REPORTING_OFFICER, "ReportingOfficer"] } },
        attributes: ["id"]
      });
      const employees = await User.findAll({ where: { reportingTo: ros.map((r) => r.id) }, attributes: ["id"] });
      const reviewDocs = await PerformanceReview.findAll({
        where: { employeeId: employees.map((u) => u.id), status: "ro_rated" },
        include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }, { model: AppraisalCycle, as: "cycle" }]
      });
      return res.json(reviewDocs);
    }

    if (roleMatches(req.user.role, ROLES.ACCEPTING_OFFICER)) {
      const reviewDocs = await PerformanceReview.findAll({
        where: { status: "revo_rated" },
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

const getRevoForm = async (req, res, next) => {
  try {
    const { appraisalId } = req.params;
    const review = await PerformanceReview.findByPk(appraisalId, {
      include: [{ model: User, as: "employee", attributes: ["id", "name", "department", "reportingTo"] }]
    });
    if (!review) return res.status(404).json({ error: "Review not found" });
    if (review.status !== "ro_rated") {
      return res.status(409).json({
        error: "Action not allowed in current appraisal state",
        required: "ro_rated",
        current: review.status
      });
    }

    const ro = await User.findByPk(review.employee.reportingTo, { attributes: ["id", "reportingTo"] });
    if (!ro || ro.reportingTo !== req.user.userId) {
      return res.status(403).json({ error: "This appraisal is not assigned to you" });
    }

    const goalRatings = await SelfAppraisalGoalRating.findAll({ where: { selfAppraisalId: review.selfAppraisalId } });
    const attributeRatings = await QuantitativeAttributeRating.findAll({ where: { reviewId: review.id } });
    // No blind-rating: RevO can see RO ratings before submitting.
    return res.json({ review, goalRatings, attributeRatings });
  } catch (error) {
    return next(error);
  }
};

const getAoForm = async (req, res, next) => {
  try {
    const { appraisalId } = req.params;
    const review = await PerformanceReview.findByPk(appraisalId, {
      include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }]
    });
    if (!review) return res.status(404).json({ error: "Review not found" });
    if (review.status !== "revo_rated") {
      return res.status(409).json({
        error: "Action not allowed in current appraisal state",
        required: "revo_rated",
        current: review.status
      });
    }

    const aos = await User.findAll({ where: { role: ROLES.ACCEPTING_OFFICER, isActive: true }, attributes: ["id"] });
    if (!aos.some((u) => u.id === req.user.userId)) {
      return res.status(403).json({ error: "This appraisal is not assigned to you" });
    }

    const goalRatings = await SelfAppraisalGoalRating.findAll({ where: { selfAppraisalId: review.selfAppraisalId } });
    const attributeRatings = await QuantitativeAttributeRating.findAll({ where: { reviewId: review.id } });
    return res.json({ review, goalRatings, attributeRatings });
  } catch (error) {
    return next(error);
  }
};

export {
  submitSelfSummary,
  rateByRO,
  reviewByReviewing,
  acceptByAccepting,
  listMyReviews,
  listQueue,
  listAttributeMasters,
  getRevoForm,
  getAoForm
};
