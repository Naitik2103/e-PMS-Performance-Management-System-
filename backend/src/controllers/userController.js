const { User } = require("../models");

const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, department, reportingTo } = req.body;
    const existing = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      res.status(409);
      return next(new Error("User with this email already exists"));
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      role: role || "Employee",
      department,
      reportingTo: reportingTo || null
    });

    return res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      reportingTo: user.reportingTo
    });
  } catch (error) {
    return next(error);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const { role, department } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (department) filter.department = department;

    const users = await User.findAll({
      where: filter,
      attributes: { exclude: ["passwordHash"] },
      order: [["createdAt", "DESC"]]
    });
    return res.json(users);
  } catch (error) {
    return next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    if (updates.email) {
      delete updates.email;
    }
    if (updates.password) {
      delete updates.password;
    }

    const user = await User.findByPk(id);
    if (!user) {
      res.status(404);
      return next(new Error("User not found"));
    }
    await user.update(updates);
    const sanitized = user.toJSON();
    delete sanitized.passwordHash;
    return res.json(sanitized);
  } catch (error) {
    return next(error);
  }
};

const hierarchy = async (req, res, next) => {
  try {
    const users = await User.findAll({ attributes: { exclude: ["passwordHash"] } });
    const plainUsers = users.map((user) => user.toJSON());
    const byId = new Map(plainUsers.map((user) => [user.id, user]));
    const tree = [];

    plainUsers.forEach((user) => {
      const managerId = user.reportingTo || null;
      if (managerId && byId.has(managerId)) {
        const manager = byId.get(managerId);
        manager.reports = manager.reports || [];
        manager.reports.push(user);
      } else {
        tree.push(user);
      }
    });

    return res.json(tree);
  } catch (error) {
    return next(error);
  }
};

module.exports = { createUser, listUsers, updateUser, hierarchy };
