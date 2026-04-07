import { Op } from "sequelize";
import { Goal, User, AppraisalCycle, PerformanceReview } from "../models.js";
import { writeAudit } from "../services/auditService.js";
import { notifyUser } from "../services/notificationService.js";
import { ROLES } from "../constants/rbac.js";

const toNumber = (v) => Number(v || 0);

const getActiveOrByYearCycle = async (cycleId, year) => {
  if (cycleId) {
    return AppraisalCycle.findByPk(cycleId);
  }
  if (year) {
    return AppraisalCycle.findOne({ where: { year, status: { [Op.in]: ["active", "draft"] } }, order: [["createdAt", "DESC"]] });
  }
  return AppraisalCycle.findOne({ where: { isActive: true }, order: [["createdAt", "DESC"]] });
};

const getDirectReports = async (managerId) => {
  const users = await User.findAll({ where: { reportingTo: managerId, isActive: true }, attributes: ["id"] });
  return users.map((u) => u.id);
};

const createGoal = async (req, res, next) => {
  try {
    const { cycleId, year, goalTitle, goalDescription, weightage } = req.body;
    const cycle = await getActiveOrByYearCycle(cycleId, year);
    if (!cycle) {
      res.status(400);
      return next(new Error("Appraisal cycle not found"));
    }

    const goal = await Goal.create({
      userId: req.user.id,
      cycleId: cycle.id,
      goalTitle,
      goalDescription,
      weightage,
      status: "draft"
    });

    await writeAudit({ user: req.user, action: "create", entity: "goal", entityId: goal.id, details: { cycleId: cycle.id } });
    return res.status(201).json(goal);
  } catch (error) {
    return next(error);
  }
};

const updateGoal = async (req, res, next) => {
  try {
    const { id } = req.params;
    const goal = await Goal.findOne({ where: { id, userId: req.user.id } });
    if (!goal) {
      res.status(404);
      return next(new Error("Goal not found"));
    }
    if (!["draft", "returned"].includes(goal.status)) {
      res.status(400);
      return next(new Error("Goal cannot be edited at this stage"));
    }

    goal.goalTitle = req.body.goalTitle;
    goal.goalDescription = req.body.goalDescription;
    goal.weightage = req.body.weightage;
    await goal.save();

    await writeAudit({ user: req.user, action: "update", entity: "goal", entityId: goal.id });
    return res.json(goal);
  } catch (error) {
    return next(error);
  }
};

const submitCycleGoals = async (req, res, next) => {
  try {
    const { cycleId, year } = req.body;
    const cycle = await getActiveOrByYearCycle(cycleId, year);
    if (!cycle) {
      res.status(400);
      return next(new Error("Appraisal cycle not found"));
    }

    const goals = await Goal.findAll({ where: { userId: req.user.id, cycleId: cycle.id } });
    if (!goals.length) {
      res.status(400);
      return next(new Error("No goals found to submit"));
    }

    const totalWeight = goals.reduce((sum, g) => sum + toNumber(g.weightage), 0);
    if (Math.round(totalWeight * 100) / 100 !== 100) {
      res.status(400);
      return next(new Error(`Total goal weightage must equal 100 for submission. Current: ${totalWeight}`));
    }

    await Goal.update({ status: "submitted", submittedAt: new Date() }, { where: { userId: req.user.id, cycleId: cycle.id } });

    const employee = await User.findByPk(req.user.id, { attributes: ["id", "name", "reportingTo"] });
    if (employee?.reportingTo) {
      await notifyUser({
        userId: employee.reportingTo,
        title: "Goal Submission Pending",
        message: `${employee.name} has submitted goals for ${cycle.name}`,
        type: "goal_submission",
        entity: "goal",
        entityId: goals[0].id
      });
    }

    await writeAudit({ user: req.user, action: "submit", entity: "goal", details: { cycleId: cycle.id, count: goals.length } });
    return res.json({ message: "Goals submitted", cycleId: cycle.id, totalWeight });
  } catch (error) {
    return next(error);
  }
};

const listMyGoals = async (req, res, next) => {
  try {
    const goals = await Goal.findAll({
      where: { userId: req.user.id },
      include: [{ model: AppraisalCycle, as: "cycle" }],
      order: [["createdAt", "DESC"]]
    });
    return res.json(goals);
  } catch (error) {
    return next(error);
  }
};

const listAllGoals = async (req, res, next) => {
  try {
    const goals = await Goal.findAll({
      include: [
        { model: User, as: "employee", attributes: ["id", "name", "email", "role", "department"] },
        { model: AppraisalCycle, as: "cycle" }
      ],
      order: [["createdAt", "DESC"]]
    });
    return res.json(goals);
  } catch (error) {
    return next(error);
  }
};

const listGoalsForRO = async (req, res, next) => {
  try {
    const reportIds = await getDirectReports(req.user.id);
    const goals = await Goal.findAll({
      where: { userId: reportIds, status: "submitted" },
      include: [
        { model: User, as: "employee", attributes: ["id", "name", "department"] },
        { model: AppraisalCycle, as: "cycle" }
      ]
    });
    return res.json(goals);
  } catch (error) {
    return next(error);
  }
};

const listGoalsForReviewing = async (req, res, next) => {
  try {
    const ros = await User.findAll({
      where: { reportingTo: req.user.id, role: { [Op.in]: [ROLES.REPORTING_OFFICER, "ReportingOfficer"] } },
      attributes: ["id"]
    });
    const roIds = ros.map((r) => r.id);
    const employees = await User.findAll({ where: { reportingTo: roIds }, attributes: ["id"] });
    const employeeIds = employees.map((u) => u.id);

    const goals = await Goal.findAll({
      where: { userId: employeeIds, status: "approved", reviewerRole: ROLES.REPORTING_OFFICER },
      include: [
        { model: User, as: "employee", attributes: ["id", "name", "department"] },
        { model: AppraisalCycle, as: "cycle" }
      ]
    });
    return res.json(goals);
  } catch (error) {
    return next(error);
  }
};

const approveGoalByRO = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { remarks, decision = "approve" } = req.body;
    const goal = await Goal.findByPk(id, { include: [{ model: User, as: "employee", attributes: ["id", "reportingTo", "name"] }] });

    if (!goal || !goal.employee || goal.employee.reportingTo !== req.user.id) {
      res.status(404);
      return next(new Error("Goal not found or not in your team"));
    }
    if (goal.status !== "submitted") {
      res.status(400);
      return next(new Error("Goal is not ready for RO action"));
    }

    goal.status = decision === "return" ? "returned" : "approved";
    goal.reviewedAt = new Date();
    goal.reviewedBy = req.user.id;
    goal.reviewerRole = ROLES.REPORTING_OFFICER;
    goal.reviewRemarks = remarks || null;
    await goal.save();

    await notifyUser({
      userId: goal.userId,
      title: "Goal Reviewed by Reporting Officer",
      message: `Your goal \"${goal.goalTitle}\" was ${goal.status}.`,
      type: "goal_review",
      entity: "goal",
      entityId: goal.id
    });

    await writeAudit({ user: req.user, action: goal.status === "approved" ? "approve" : "return", entity: "goal", entityId: goal.id });
    return res.json(goal);
  } catch (error) {
    return next(error);
  }
};

const approveGoalByReviewing = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { remarks, decision = "approve" } = req.body;
    const goal = await Goal.findByPk(id, { include: [{ model: User, as: "employee", attributes: ["id", "reportingTo", "name"] }] });
    if (!goal) {
      res.status(404);
      return next(new Error("Goal not found"));
    }
    if (goal.status !== "approved" || goal.reviewerRole !== ROLES.REPORTING_OFFICER) {
      res.status(400);
      return next(new Error("Goal is not ready for Reviewing Officer action"));
    }

    const ro = await User.findByPk(goal.employee.reportingTo, { attributes: ["reportingTo"] });
    if (!ro || ro.reportingTo !== req.user.id) {
      res.status(403);
      return next(new Error("Access denied for this goal"));
    }

    goal.status = decision === "return" ? "returned" : "approved";
    goal.reviewedAt = new Date();
    goal.reviewedBy = req.user.id;
    goal.reviewerRole = ROLES.REVIEWING_OFFICER;
    goal.reviewRemarks = remarks || null;
    await goal.save();

    await notifyUser({
      userId: goal.userId,
      title: "Goal Reviewed by Reviewing Officer",
      message: `Your goal \"${goal.goalTitle}\" was ${decision === "return" ? "returned" : "approved"}.`,
      type: "goal_review",
      entity: "goal",
      entityId: goal.id
    });

    await writeAudit({ user: req.user, action: decision === "return" ? "return" : "approve", entity: "goal", entityId: goal.id });
    return res.json(goal);
  } catch (error) {
    return next(error);
  }
};

const resolveReviewAndGoals = async (appraisalId) => {
  const review = await PerformanceReview.findByPk(appraisalId);
  if (!review) return { review: null, goals: [] };
  const goals = await Goal.findAll({ where: { userId: review.employeeId, cycleId: review.cycleId } });
  return { review, goals };
};

const getGoalsByAppraisalId = async (req, res, next) => {
  try {
    const { appraisalId } = req.params;
    const { review, goals } = await resolveReviewAndGoals(appraisalId);
    if (!review) return res.status(404).json({ error: "Appraisal not found" });
    return res.json(goals);
  } catch (error) {
    return next(error);
  }
};

const updateGoalsByAppraisalId = async (req, res, next) => {
  try {
    const { appraisalId } = req.params;
    const { review, goals } = await resolveReviewAndGoals(appraisalId);
    if (!review) return res.status(404).json({ error: "Appraisal not found" });
    if (review.employeeId !== req.user.userId) return res.status(403).json({ error: "This appraisal is not assigned to you" });
    if (review.status !== "draft") {
      return res.status(409).json({ error: "Action not allowed in current appraisal state", required: "draft", current: review.status });
    }
    const updates = Array.isArray(req.body?.goals) ? req.body.goals : [];
    for (const update of updates) {
      const goal = goals.find((g) => g.id === update.id);
      if (!goal) continue;
      goal.goalTitle = update.kpa_title ?? update.goalTitle ?? goal.goalTitle;
      goal.goalDescription = update.description ?? update.goalDescription ?? goal.goalDescription;
      goal.weightage = update.weightage ?? goal.weightage;
      await goal.save();
    }
    return res.json({ message: "Goals updated" });
  } catch (error) {
    return next(error);
  }
};

const submitGoalsByAppraisalId = async (req, res, next) => {
  try {
    const { appraisalId } = req.params;
    const { review, goals } = await resolveReviewAndGoals(appraisalId);
    if (!review) return res.status(404).json({ error: "Appraisal not found" });
    if (review.employeeId !== req.user.userId) return res.status(403).json({ error: "This appraisal is not assigned to you" });
    if (review.status !== "draft") {
      return res.status(409).json({ error: "Action not allowed in current appraisal state", required: "draft", current: review.status });
    }
    const totalWeight = goals.reduce((sum, g) => sum + Number(g.weightage || 0), 0);
    if (Math.round(totalWeight * 100) / 100 !== 100) {
      return res.status(400).json({ error: "Validation error", details: ["Total goal weightage must equal 100"] });
    }
    await Goal.update({ status: "submitted", submittedAt: new Date() }, { where: { userId: review.employeeId, cycleId: review.cycleId } });
    review.status = "submitted";
    await review.save();
    return res.json({ message: "Goals submitted" });
  } catch (error) {
    return next(error);
  }
};

const approveGoalsByAppraisalId = async (req, res, next) => {
  try {
    const { appraisalId } = req.params;
    const { review } = await resolveReviewAndGoals(appraisalId);
    if (!review) return res.status(404).json({ error: "Appraisal not found" });
    if (review.status !== "submitted") {
      return res.status(409).json({ error: "Action not allowed in current appraisal state", required: "submitted", current: review.status });
    }
    const employee = await User.findByPk(review.employeeId, { attributes: ["reportingTo"] });
    if (!employee || employee.reportingTo !== req.user.userId) {
      return res.status(403).json({ error: "This appraisal is not assigned to you" });
    }
    await Goal.update({ status: "approved", reviewedAt: new Date(), reviewedBy: req.user.userId, reviewerRole: ROLES.REPORTING_OFFICER }, { where: { userId: review.employeeId, cycleId: review.cycleId } });
    review.status = "ro_approved";
    await review.save();
    return res.json({ message: "Goals approved" });
  } catch (error) {
    return next(error);
  }
};

const sendbackGoalsByAppraisalId = async (req, res, next) => {
  try {
    const { appraisalId } = req.params;
    const { review } = await resolveReviewAndGoals(appraisalId);
    if (!review) return res.status(404).json({ error: "Appraisal not found" });
    if (review.status !== "submitted") {
      return res.status(409).json({ error: "Action not allowed in current appraisal state", required: "submitted", current: review.status });
    }
    const employee = await User.findByPk(review.employeeId, { attributes: ["reportingTo"] });
    if (!employee || employee.reportingTo !== req.user.userId) {
      return res.status(403).json({ error: "This appraisal is not assigned to you" });
    }
    await Goal.update({ status: "returned", reviewedAt: new Date(), reviewedBy: req.user.userId, reviewerRole: ROLES.REPORTING_OFFICER }, { where: { userId: review.employeeId, cycleId: review.cycleId } });
    review.status = "draft";
    await review.save();
    return res.json({ message: "Goals sent back" });
  } catch (error) {
    return next(error);
  }
};

export {
  createGoal,
  updateGoal,
  submitCycleGoals,
  listMyGoals,
  listAllGoals,
  listGoalsForRO,
  listGoalsForReviewing,
  approveGoalByRO,
  approveGoalByReviewing,
  getGoalsByAppraisalId,
  updateGoalsByAppraisalId,
  submitGoalsByAppraisalId,
  approveGoalsByAppraisalId,
  sendbackGoalsByAppraisalId
};
