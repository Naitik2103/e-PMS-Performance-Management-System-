const { Goal, User } = require("../models");

const calculateTotalWeight = (kpas) => kpas.reduce((sum, kpa) => sum + (kpa.weight || 0), 0);

const createGoal = async (req, res, next) => {
  try {
    const { year, kpas, submit } = req.body;
    const totalWeight = calculateTotalWeight(kpas);
    if (submit && totalWeight !== 100) {
      res.status(400);
      return next(new Error("Total KPA weight must be exactly 100 to submit"));
    }

    const goal = await Goal.create({
      employeeId: req.user.id,
      year,
      kpas,
      status: submit ? "submitted" : "draft",
      submittedAt: submit ? new Date() : undefined
    });

    return res.status(201).json(goal);
  } catch (error) {
    return next(error);
  }
};

const updateGoal = async (req, res, next) => {
  try {
    const { id } = req.params;
    const goal = await Goal.findOne({ where: { id, employeeId: req.user.id } });
    if (!goal) {
      res.status(404);
      return next(new Error("Goal not found"));
    }
    if (goal.status !== "draft") {
      res.status(400);
      return next(new Error("Editing is disabled after submission"));
    }

    goal.year = req.body.year;
    goal.kpas = req.body.kpas;
    await goal.save();

    return res.json(goal);
  } catch (error) {
    return next(error);
  }
};

const submitGoal = async (req, res, next) => {
  try {
    const { id } = req.params;
    const goal = await Goal.findOne({ where: { id, employeeId: req.user.id } });
    if (!goal) {
      res.status(404);
      return next(new Error("Goal not found"));
    }
    if (goal.status !== "draft") {
      res.status(400);
      return next(new Error("Goal already submitted"));
    }

    if (goal.totalWeight !== 100) {
      res.status(400);
      return next(new Error("Total KPA weight must be exactly 100"));
    }

    goal.status = "submitted";
    goal.submittedAt = new Date();
    await goal.save();

    return res.json(goal);
  } catch (error) {
    return next(error);
  }
};

const listMyGoals = async (req, res, next) => {
  try {
    const goals = await Goal.findAll({
      where: { employeeId: req.user.id },
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
      include: [{ model: User, as: "employee", attributes: ["id", "name", "email", "role", "department"] }]
    });
    return res.json(goals);
  } catch (error) {
    return next(error);
  }
};

const getDirectReports = async (managerId) => {
  const reports = await User.findAll({ where: { reportingTo: managerId }, attributes: ["id"] });
  return reports.map((report) => report.id);
};

const listGoalsForRO = async (req, res, next) => {
  try {
    const reportIds = await getDirectReports(req.user.id);
    const goals = await Goal.findAll({
      where: { employeeId: reportIds, status: "submitted" },
      include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }]
    });
    return res.json(goals);
  } catch (error) {
    return next(error);
  }
};

const listGoalsForReviewing = async (req, res, next) => {
  try {
    const reportingOfficers = await User.findAll({
      where: { reportingTo: req.user.id, role: "ReportingOfficer" },
      attributes: ["id"]
    });
    const reportingOfficerIds = reportingOfficers.map((officer) => officer.id);
    const reportDocs = await User.findAll({ where: { reportingTo: reportingOfficerIds }, attributes: ["id"] });
    const reportIds = reportDocs.map((report) => report.id);
    const goals = await Goal.findAll({
      where: { employeeId: reportIds, status: "ro_approved" },
      include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }]
    });
    return res.json(goals);
  } catch (error) {
    return next(error);
  }
};

const approveGoalByRO = async (req, res, next) => {
  try {
    const { id } = req.params;
    const goal = await Goal.findByPk(id, {
      include: [{ model: User, as: "employee", attributes: ["id", "reportingTo"] }]
    });
    if (!goal) {
      res.status(404);
      return next(new Error("Goal not found"));
    }
    if (goal.status !== "submitted") {
      res.status(400);
      return next(new Error("Goal is not ready for RO approval"));
    }
    if (!goal.employee.reportingTo || goal.employee.reportingTo !== req.user.id) {
      res.status(403);
      return next(new Error("Access denied for this goal"));
    }

    goal.status = "ro_approved";
    goal.roApprovedAt = new Date();
    goal.roApproverId = req.user.id;
    await goal.save();

    return res.json(goal);
  } catch (error) {
    return next(error);
  }
};

const approveGoalByReviewing = async (req, res, next) => {
  try {
    const { id } = req.params;
    const goal = await Goal.findByPk(id, {
      include: [{ model: User, as: "employee", attributes: ["id", "reportingTo"] }]
    });
    if (!goal) {
      res.status(404);
      return next(new Error("Goal not found"));
    }
    if (goal.status !== "ro_approved") {
      res.status(400);
      return next(new Error("Goal is not ready for Reviewing Officer approval"));
    }

    const reportingOfficer = await User.findByPk(goal.employee.reportingTo);
    if (!reportingOfficer || reportingOfficer.reportingTo !== req.user.id) {
      res.status(403);
      return next(new Error("Access denied for this goal"));
    }

    goal.status = "rev_approved";
    goal.revApprovedAt = new Date();
    goal.revApproverId = req.user.id;
    await goal.save();

    return res.json(goal);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createGoal,
  updateGoal,
  submitGoal,
  listMyGoals,
  listAllGoals,
  listGoalsForRO,
  listGoalsForReviewing,
  approveGoalByRO,
  approveGoalByReviewing
};
