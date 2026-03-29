const { AppraisalCycle, QuantitativeAttributeMaster, User } = require("../models");
const { writeAudit } = require("../services/auditService");

const listCycles = async (req, res, next) => {
  try {
    const cycles = await AppraisalCycle.findAll({ order: [["year", "DESC"], ["createdAt", "DESC"]] });
    return res.json(cycles);
  } catch (error) {
    return next(error);
  }
};

const createCycle = async (req, res, next) => {
  try {
    const cycle = await AppraisalCycle.create(req.body);
    if (cycle.isActive) {
      await AppraisalCycle.update({ isActive: false, status: "closed" }, { where: { id: { [require("sequelize").Op.ne]: cycle.id }, isActive: true } });
      cycle.status = "active";
      await cycle.save();
    }
    await writeAudit({ user: req.user, action: "create", entity: "appraisal_cycle", entityId: cycle.id });
    return res.status(201).json(cycle);
  } catch (error) {
    return next(error);
  }
};

const updateCycle = async (req, res, next) => {
  try {
    const cycle = await AppraisalCycle.findByPk(req.params.id);
    if (!cycle) {
      res.status(404);
      return next(new Error("Cycle not found"));
    }
    await cycle.update(req.body);
    if (cycle.isActive) {
      await AppraisalCycle.update({ isActive: false, status: "closed" }, { where: { id: { [require("sequelize").Op.ne]: cycle.id }, isActive: true } });
      cycle.status = "active";
      await cycle.save();
    }
    await writeAudit({ user: req.user, action: "update", entity: "appraisal_cycle", entityId: cycle.id });
    return res.json(cycle);
  } catch (error) {
    return next(error);
  }
};

const listAttributeMasters = async (req, res, next) => {
  try {
    const attrs = await QuantitativeAttributeMaster.findAll({ order: [["category", "ASC"], ["attributeName", "ASC"]] });
    return res.json(attrs);
  } catch (error) {
    return next(error);
  }
};

const createAttributeMaster = async (req, res, next) => {
  try {
    const row = await QuantitativeAttributeMaster.create(req.body);
    await writeAudit({ user: req.user, action: "create", entity: "attribute_master", entityId: row.id });
    return res.status(201).json(row);
  } catch (error) {
    return next(error);
  }
};

const updateAttributeMaster = async (req, res, next) => {
  try {
    const row = await QuantitativeAttributeMaster.findByPk(req.params.id);
    if (!row) {
      res.status(404);
      return next(new Error("Attribute not found"));
    }
    await row.update(req.body);
    await writeAudit({ user: req.user, action: "update", entity: "attribute_master", entityId: row.id });
    return res.json(row);
  } catch (error) {
    return next(error);
  }
};

const roleAssignment = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      res.status(404);
      return next(new Error("User not found"));
    }
    user.role = req.body.role;
    user.reportingTo = req.body.reportingTo === "" ? null : req.body.reportingTo;
    await user.save();
    await writeAudit({ user: req.user, action: "update", entity: "user_role", entityId: user.id, details: { role: user.role } });
    return res.json({ id: user.id, role: user.role, reportingTo: user.reportingTo });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listCycles,
  createCycle,
  updateCycle,
  listAttributeMasters,
  createAttributeMaster,
  updateAttributeMaster,
  roleAssignment
};
