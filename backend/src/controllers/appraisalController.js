import { Op } from "sequelize";
import { PerformanceReview, User, AppraisalCycle } from "../models.js";
import { ROLES, normalizeRole } from "../constants/rbac.js";

const listMine = async (req, res, next) => {
  try {
    const reviews = await PerformanceReview.findAll({
      where: { employeeId: req.user.userId },
      include: [{ model: AppraisalCycle, as: "cycle" }],
      order: [["createdAt", "DESC"]]
    });
    return res.json(reviews);
  } catch (error) {
    return next(error);
  }
};

const listMyTeam = async (req, res, next) => {
  try {
    const reports = await User.findAll({ where: { reportingTo: req.user.userId }, attributes: ["id"] });
    const rows = await PerformanceReview.findAll({
      where: { employeeId: reports.map((r) => r.id) },
      include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }, { model: AppraisalCycle, as: "cycle" }]
    });
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
};

const listMyReviewList = async (req, res, next) => {
  try {
    const ros = await User.findAll({ where: { reportingTo: req.user.userId }, attributes: ["id"] });
    const employees = await User.findAll({ where: { reportingTo: ros.map((r) => r.id) }, attributes: ["id"] });
    const rows = await PerformanceReview.findAll({
      where: { employeeId: employees.map((u) => u.id) },
      include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }, { model: AppraisalCycle, as: "cycle" }]
    });
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
};

const listMyAcceptList = async (req, res, next) => {
  try {
    const rows = await PerformanceReview.findAll({
      where: { status: { [Op.in]: ["revo_rated", "ao_accepted", "completed"] } },
      include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }, { model: AppraisalCycle, as: "cycle" }]
    });
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
};

const getSummary = async (req, res, next) => {
  try {
    const review = await PerformanceReview.findByPk(req.params.id, {
      include: [{ model: User, as: "employee", attributes: ["id", "name", "department"] }, { model: AppraisalCycle, as: "cycle" }]
    });
    if (!review) return res.status(404).json({ error: "Review not found" });

    const role = normalizeRole(req.user.role);
    const allowed =
      role === ROLES.HR_ADMIN ||
      (role === ROLES.EMPLOYEE && review.employeeId === req.user.userId) ||
      (role === ROLES.REPORTING_OFFICER && review.status) ||
      (role === ROLES.REVIEWING_OFFICER && review.status) ||
      (role === ROLES.ACCEPTING_OFFICER && review.status);
    if (!allowed) return res.status(403).json({ error: "This appraisal is not assigned to you" });

    return res.json(review);
  } catch (error) {
    return next(error);
  }
};

export { listMine, listMyTeam, listMyReviewList, listMyAcceptList, getSummary };
