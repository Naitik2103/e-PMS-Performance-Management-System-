const { SixMonthReview, Goal, User } = require("../models");
const { writeAudit } = require("../services/auditService");
const { notifyUser } = require("../services/notificationService");

const upsertTracking = async (req, res, next) => {
  try {
    const { goalId, cycleId, period, progressText } = req.body;
    const goal = await Goal.findByPk(goalId);
    if (!goal || goal.userId !== req.user.id) {
      res.status(404);
      return next(new Error("Goal not found for this employee"));
    }

    const existing = await SixMonthReview.findOne({ where: { employeeId: req.user.id, goalId, cycleId: cycleId || goal.cycleId, period } });
    let review;
    if (existing) {
      existing.progressText = progressText;
      existing.submittedAt = new Date();
      review = await existing.save();
      await writeAudit({ user: req.user, action: "update", entity: "six_month_review", entityId: review.id });
    } else {
      review = await SixMonthReview.create({
        employeeId: req.user.id,
        goalId,
        cycleId: cycleId || goal.cycleId,
        period,
        progressText,
        submittedAt: new Date()
      });
      await writeAudit({ user: req.user, action: "submit", entity: "six_month_review", entityId: review.id });
    }

    const employee = await User.findByPk(req.user.id, { attributes: ["name", "reportingTo"] });
    if (employee?.reportingTo) {
      await notifyUser({
        userId: employee.reportingTo,
        title: "Six-Month Review Submitted",
        message: `${employee.name} submitted ${period} tracking for goal review.`,
        type: "tracking_submission",
        entity: "six_month_review",
        entityId: review.id
      });
    }

    return res.json(review);
  } catch (error) {
    return next(error);
  }
};

const addRoRemarks = async (req, res, next) => {
  try {
    const { trackingId, reportingRemarks } = req.body;
    const tracking = await SixMonthReview.findByPk(trackingId, {
      include: [{ model: User, as: "employee", attributes: ["id", "reportingTo"] }]
    });
    if (!tracking) {
      res.status(404);
      return next(new Error("Tracking record not found"));
    }

    if (tracking.employee.reportingTo !== req.user.id) {
      res.status(403);
      return next(new Error("Access denied for this tracking record"));
    }

    tracking.reportingRemarks = reportingRemarks;
    tracking.remarkedAt = new Date();
    await tracking.save();

    await writeAudit({ user: req.user, action: "remark", entity: "six_month_review", entityId: tracking.id });
    await notifyUser({
      userId: tracking.employeeId,
      title: "Tracking Remark Added",
      message: "Reporting Officer has added remarks to your six-month tracking.",
      type: "tracking_review",
      entity: "six_month_review",
      entityId: tracking.id
    });

    return res.json(tracking);
  } catch (error) {
    return next(error);
  }
};

const listMyTracking = async (req, res, next) => {
  try {
    const reviews = await SixMonthReview.findAll({
      where: { employeeId: req.user.id },
      include: [{ model: Goal, as: "goal", attributes: ["id", "goalTitle", "weightage", "status"] }],
      order: [["updatedAt", "DESC"]]
    });
    return res.json(reviews);
  } catch (error) {
    return next(error);
  }
};

const listTeamTracking = async (req, res, next) => {
  try {
    const reports = await User.findAll({ where: { reportingTo: req.user.id }, attributes: ["id"] });
    const reportIds = reports.map((report) => report.id);
    const tracking = await SixMonthReview.findAll({
      where: { employeeId: reportIds },
      include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }],
      order: [["updatedAt", "DESC"]]
    });
    return res.json(tracking);
  } catch (error) {
    return next(error);
  }
};

module.exports = { upsertTracking, addRoRemarks, listMyTracking, listTeamTracking };
