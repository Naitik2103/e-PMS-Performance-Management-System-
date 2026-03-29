const { Op } = require("sequelize");
const { Goal, User, AppraisalCycle } = require("../models");
const { writeAudit } = require("../services/auditService");
const { notifyUser } = require("../services/notificationService");

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
    const ros = await User.findAll({ where: { reportingTo: req.user.id, role: "ReportingOfficer" }, attributes: ["id"] });
    const roIds = ros.map((r) => r.id);
    const employees = await User.findAll({ where: { reportingTo: roIds }, attributes: ["id"] });
    const employeeIds = employees.map((u) => u.id);

    const goals = await Goal.findAll({
      where: { userId: employeeIds, status: "approved", reviewerRole: "ReportingOfficer" },
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
    goal.reviewerRole = "ReportingOfficer";
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
    if (goal.status !== "approved" || goal.reviewerRole !== "ReportingOfficer") {
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
    goal.reviewerRole = "ReviewingOfficer";
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

module.exports = {
  createGoal,
  updateGoal,
  submitCycleGoals,
  listMyGoals,
  listAllGoals,
  listGoalsForRO,
  listGoalsForReviewing,
  approveGoalByRO,
  approveGoalByReviewing
};
