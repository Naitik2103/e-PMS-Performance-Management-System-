const SixMonthTracking = require("../models/SixMonthTracking");
const Goal = require("../models/Goal");
const User = require("../models/User");

const upsertTracking = async (req, res, next) => {
  try {
    const { goalId, year, period, progressEntries } = req.body;
    const goal = await Goal.findById(goalId);
    if (!goal || goal.employee.toString() !== req.user._id.toString()) {
      res.status(404);
      return next(new Error("Goal not found for this employee"));
    }

    const tracking = await SixMonthTracking.findOneAndUpdate(
      { employee: req.user._id, goal: goalId, year, period },
      { progressEntries, status: "open" },
      { new: true, upsert: true }
    );

    return res.json(tracking);
  } catch (error) {
    return next(error);
  }
};

const addRoRemarks = async (req, res, next) => {
  try {
    const { trackingId, roRemarks } = req.body;
    const tracking = await SixMonthTracking.findById(trackingId).populate("employee", "reportingTo");
    if (!tracking) {
      res.status(404);
      return next(new Error("Tracking record not found"));
    }

    if (tracking.employee.reportingTo?.toString() !== req.user._id.toString()) {
      res.status(403);
      return next(new Error("Access denied for this tracking record"));
    }

    tracking.roRemarks = roRemarks;
    tracking.status = "ro_remarked";
    await tracking.save();

    return res.json(tracking);
  } catch (error) {
    return next(error);
  }
};

const listMyTracking = async (req, res, next) => {
  try {
    const tracking = await SixMonthTracking.find({ employee: req.user._id })
      .populate("goal", "year status")
      .sort({ updatedAt: -1 });
    return res.json(tracking);
  } catch (error) {
    return next(error);
  }
};

const listTeamTracking = async (req, res, next) => {
  try {
    const reports = await User.find({ reportingTo: req.user._id }).select("_id");
    const reportIds = reports.map((report) => report._id);
    const tracking = await SixMonthTracking.find({ employee: { $in: reportIds } })
      .populate("employee", "name department")
      .sort({ updatedAt: -1 });
    return res.json(tracking);
  } catch (error) {
    return next(error);
  }
};

module.exports = { upsertTracking, addRoRemarks, listMyTracking, listTeamTracking };
