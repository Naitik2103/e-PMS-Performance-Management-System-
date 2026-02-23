const Goal = require("../models/Goal");
const User = require("../models/User");

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
      employee: req.user._id,
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
    const goal = await Goal.findOne({ _id: id, employee: req.user._id });
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
    const goal = await Goal.findOne({ _id: id, employee: req.user._id });
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
    const goals = await Goal.find({ employee: req.user._id }).sort({ createdAt: -1 });
    return res.json(goals);
  } catch (error) {
    return next(error);
  }
};

const listAllGoals = async (req, res, next) => {
  try {
    const goals = await Goal.find({}).populate("employee", "name email role department");
    return res.json(goals);
  } catch (error) {
    return next(error);
  }
};

const getDirectReports = async (managerId) => {
  const reports = await User.find({ reportingTo: managerId }).select("_id");
  return reports.map((report) => report._id);
};

const listGoalsForRO = async (req, res, next) => {
  try {
    const reportIds = await getDirectReports(req.user._id);
    const goals = await Goal.find({ employee: { $in: reportIds }, status: "submitted" })
      .populate("employee", "name department");
    return res.json(goals);
  } catch (error) {
    return next(error);
  }
};

const listGoalsForReviewing = async (req, res, next) => {
  try {
    const reportingOfficers = await User.find({ reportingTo: req.user._id, role: "ReportingOfficer" }).select("_id");
    const reportingOfficerIds = reportingOfficers.map((officer) => officer._id);
    const reportDocs = await User.find({ reportingTo: { $in: reportingOfficerIds } }).select("_id");
    const reportIds = reportDocs.map((report) => report._id);
    const goals = await Goal.find({ employee: { $in: reportIds }, status: "ro_approved" })
      .populate("employee", "name department");
    return res.json(goals);
  } catch (error) {
    return next(error);
  }
};

const approveGoalByRO = async (req, res, next) => {
  try {
    const { id } = req.params;
    const goal = await Goal.findById(id).populate("employee", "reportingTo");
    if (!goal) {
      res.status(404);
      return next(new Error("Goal not found"));
    }
    if (goal.status !== "submitted") {
      res.status(400);
      return next(new Error("Goal is not ready for RO approval"));
    }
    if (!goal.employee.reportingTo || goal.employee.reportingTo.toString() !== req.user._id.toString()) {
      res.status(403);
      return next(new Error("Access denied for this goal"));
    }

    goal.status = "ro_approved";
    goal.roApprovedAt = new Date();
    goal.roApprover = req.user._id;
    await goal.save();

    return res.json(goal);
  } catch (error) {
    return next(error);
  }
};

const approveGoalByReviewing = async (req, res, next) => {
  try {
    const { id } = req.params;
    const goal = await Goal.findById(id).populate("employee", "reportingTo");
    if (!goal) {
      res.status(404);
      return next(new Error("Goal not found"));
    }
    if (goal.status !== "ro_approved") {
      res.status(400);
      return next(new Error("Goal is not ready for Reviewing Officer approval"));
    }

    const reportingOfficer = await User.findById(goal.employee.reportingTo);
    if (!reportingOfficer || reportingOfficer.reportingTo?.toString() !== req.user._id.toString()) {
      res.status(403);
      return next(new Error("Access denied for this goal"));
    }

    goal.status = "rev_approved";
    goal.revApprovedAt = new Date();
    goal.revApprover = req.user._id;
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
