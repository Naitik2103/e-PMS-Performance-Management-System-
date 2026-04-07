import { User } from "../models.js";
import { ROLES, normalizeRole } from "../constants/rbac.js";
import { Op, fn, col } from "sequelize";

const getDisplayName = (user) => {
  const first = (user.firstName || "").trim();
  const last = (user.lastName || "").trim();
  if (first || last) return `${first} ${last}`.trim();
  return user.name;
};

const createUser = async (req, res, next) => {
  try {
    const { firstName, lastName, name, email, password, role, department, reportingTo, reviewingOfficerId, acceptingOfficerId } = req.body;
    const existing = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      res.status(409);
      return next(new Error("User with this email already exists"));
    }

    const passwordHash = await User.hashPassword(password);
    const resolvedFirstName = (firstName || "").trim();
    const resolvedLastName = (lastName || "").trim();
    const resolvedName = name || `${resolvedFirstName} ${resolvedLastName}`.trim();
    const user = await User.create({
      firstName: resolvedFirstName || null,
      lastName: resolvedLastName || null,
      name: resolvedName,
      email: email.toLowerCase(),
      passwordHash,
      role: normalizeRole(role || ROLES.EMPLOYEE),
      department,
      reportingTo: reportingTo || null,
      reviewingOfficerId: reviewingOfficerId || null,
      acceptingOfficerId: acceptingOfficerId || null
    });

    return res.status(201).json({
      id: user.id,
      name: getDisplayName(user),
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      department: user.department,
      reportingTo: user.reportingTo,
      reviewingOfficerId: user.reviewingOfficerId,
      acceptingOfficerId: user.acceptingOfficerId
    });
  } catch (error) {
    return next(error);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const { role, department } = req.query;
    const filter = {};
    if (role) filter.role = normalizeRole(role);
    if (department) filter.department = department;

    const users = await User.findAll({
      where: filter,
      attributes: { exclude: ["passwordHash"] },
      order: [["createdAt", "DESC"]]
    });
    return res.json(users.map((user) => ({
      ...user.toJSON(),
      name: getDisplayName(user)
    })));
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
    if (updates.role) {
      updates.role = normalizeRole(updates.role);
    }
    if (updates.firstName || updates.lastName) {
      const nextFirst = (updates.firstName ?? user.firstName ?? "").trim();
      const nextLast = (updates.lastName ?? user.lastName ?? "").trim();
      updates.name = `${nextFirst} ${nextLast}`.trim() || user.name;
    }
    await user.update(updates);
    const sanitized = user.toJSON();
    delete sanitized.passwordHash;
    sanitized.name = getDisplayName(user);
    return res.json(sanitized);
  } catch (error) {
    return next(error);
  }
};

const hierarchy = async (req, res, next) => {
  try {
    const users = await User.findAll({ attributes: { exclude: ["passwordHash"] } });
    const plainUsers = users.map((user) => ({ ...user.toJSON(), name: getDisplayName(user) }));
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

const listDepartments = async (req, res, next) => {
  try {
    const rows = await User.findAll({
      attributes: [[fn("DISTINCT", col("department")), "department"]],
      where: { department: { [Op.ne]: null } },
      order: [["department", "ASC"]]
    });
    return res.json(rows.map((row) => row.get("department")).filter(Boolean));
  } catch (error) {
    return next(error);
  }
};

export { createUser, listUsers, updateUser, hierarchy, listDepartments };
