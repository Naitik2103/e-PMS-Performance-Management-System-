const { SixMonthTracking, Goal, User } = require("../models");

const upsertTracking = async (req, res, next) => {
  try {
    const { goalId, year, period, progressEntries } = req.body;
    const goal = await Goal.findByPk(goalId);
    if (!goal || goal.employeeId !== req.user.id) {
      res.status(404);
      return next(new Error("Goal not found for this employee"));
    }

    const existing = await SixMonthTracking.findOne({
      where: { employeeId: req.user.id, goalId, year, period }
    });
    let tracking;
    if (existing) {
      tracking = await existing.update({ progressEntries, status: "open" });
    } else {
      tracking = await SixMonthTracking.create({
        employeeId: req.user.id,
        goalId,
        year,
        period,
        progressEntries,
        status: "open"
      });
    }

    return res.json(tracking);
  } catch (error) {
    return next(error);
  }
};

const addRoRemarks = async (req, res, next) => {
  try {
    const { trackingId, roRemarks } = req.body;
    const tracking = await SixMonthTracking.findByPk(trackingId, {
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
    const tracking = await SixMonthTracking.findAll({
      where: { employeeId: req.user.id },
      include: [{ model: Goal, as: "goal", attributes: ["id", "year", "status"] }],
      order: [["updatedAt", "DESC"]]
    });
    return res.json(tracking);
  } catch (error) {
    return next(error);
  }
};

const listTeamTracking = async (req, res, next) => {
  try {
    const reports = await User.findAll({ where: { reportingTo: req.user.id }, attributes: ["id"] });
    const reportIds = reports.map((report) => report.id);
    const tracking = await SixMonthTracking.findAll({
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
