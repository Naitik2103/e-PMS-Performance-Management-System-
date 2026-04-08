import dotenv from "dotenv";
import { connectDb } from "../config/db.js";
import { sequelize, User, AppraisalCycle, QuantitativeAttributeMaster } from "../models.js";
import { ROLES } from "../constants/rbac.js";

dotenv.config();

const seed = async () => {
  try {
    await connectDb();
    await sequelize.sync({ force: true });

    const adminPassword = await User.hashPassword("Password123!");
    const acceptingPassword = await User.hashPassword("Password123!");
    const reviewingPassword = await User.hashPassword("Password123!");
    const reportingPassword = await User.hashPassword("Password123!");
    const employeePassword = await User.hashPassword("Password123!");

    const admin = await User.create({
      firstName: "System",
      lastName: "Admin",
      name: "System Admin",
      email: "admin@epms.local",
      passwordHash: adminPassword,
      role: ROLES.HR_ADMIN,
      department: "Administration"
    });

    const acceptingOfficer = await User.create({
      firstName: "Ava",
      lastName: "Accept",
      name: "Ava Accept",
      email: "accepting@epms.local",
      passwordHash: acceptingPassword,
      role: ROLES.ACCEPTING_OFFICER,
      department: "Central Office"
    });

    const reviewingOfficer = await User.create({
      firstName: "Riya",
      lastName: "Review",
      name: "Riya Review",
      email: "reviewing@epms.local",
      passwordHash: reviewingPassword,
      role: ROLES.REVIEWING_OFFICER,
      department: "Central Office",
      reportingTo: acceptingOfficer.id
    });

    const reportingOfficer = await User.create({
      firstName: "Rohan",
      lastName: "Report",
      name: "Rohan Report",
      email: "reporting@epms.local",
      passwordHash: reportingPassword,
      role: ROLES.REPORTING_OFFICER,
      department: "Computer Science",
      reportingTo: reviewingOfficer.id
    });

    const employee = await User.create({
      firstName: "Emma",
      lastName: "Employee",
      name: "Emma Employee",
      email: "employee@epms.local",
      passwordHash: employeePassword,
      role: ROLES.EMPLOYEE,
      department: "Computer Science",
      reportingTo: reportingOfficer.id
    });

    const multiRolePassword = await User.hashPassword("Password123!");
    const multiRoleUser = await User.create({
      firstName: "Maya",
      lastName: "MultiRole",
      name: "Maya MultiRole",
      email: "multirole@epms.local",
      passwordHash: multiRolePassword,
      role: ROLES.EMPLOYEE,
      department: "Computer Science"
    });

    // Make Maya a Reporting Officer by assigning direct reports.
    await User.create({
      firstName: "Dev",
      lastName: "Report1",
      name: "Dev Report1",
      email: "report1@epms.local",
      passwordHash: employeePassword,
      role: ROLES.EMPLOYEE,
      department: "Computer Science",
      reportingTo: multiRoleUser.id
    });
    await User.create({
      firstName: "Dev",
      lastName: "Report2",
      name: "Dev Report2",
      email: "report2@epms.local",
      passwordHash: employeePassword,
      role: ROLES.EMPLOYEE,
      department: "Computer Science",
      reportingTo: multiRoleUser.id
    });

    // Make Maya a Reviewing Officer by assigning an RO under her.
    await User.create({
      firstName: "Ron",
      lastName: "ROUnderMaya",
      name: "Ron ROUnderMaya",
      email: "ro-under-maya@epms.local",
      passwordHash: reportingPassword,
      role: ROLES.REPORTING_OFFICER,
      department: "Computer Science",
      reportingTo: multiRoleUser.id
    });

    // Make Maya an Accepting Officer by assigning an employee who has Maya as accepting officer.
    await User.create({
      firstName: "Ann",
      lastName: "AOUnderMaya",
      name: "Ann AOUnderMaya",
      email: "ao-under-maya@epms.local",
      passwordHash: employeePassword,
      role: ROLES.EMPLOYEE,
      department: "Computer Science",
      acceptingOfficerId: multiRoleUser.id
    });

    const year = new Date().getFullYear();
    const cycle = await AppraisalCycle.create({
      name: `Annual Appraisal ${year}`,
      year,
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      goalSettingStart: `${year}-01-01`,
      goalSettingEnd: `${year}-01-31`,
      sixMonthProgressReviewStart: `${year}-06-01`,
      sixMonthProgressReviewEnd: `${year}-06-30`,
      annualAppraisalStart: `${year}-11-01`,
      annualAppraisalEnd: `${year}-12-31`,
      isActive: true,
      status: "active"
    });

    await QuantitativeAttributeMaster.bulkCreate([
      { category: "Values", attributeName: "Integrity", description: "Acts with honesty and accountability" },
      { category: "Values", attributeName: "Commitment", description: "Demonstrates commitment to institutional goals" },
      { category: "Competencies", attributeName: "Problem Solving", description: "Resolves issues effectively" },
      { category: "Competencies", attributeName: "Communication", description: "Communicates clearly and professionally" },
      { category: "Personal Qualities", attributeName: "Adaptability", description: "Adjusts well to change" },
      { category: "Knowledge", attributeName: "Domain Knowledge", description: "Demonstrates strong subject knowledge" }
    ]);

    console.log("Seeded users:", {
      admin: admin.email,
      acceptingOfficer: acceptingOfficer.email,
      reviewingOfficer: reviewingOfficer.email,
      reportingOfficer: reportingOfficer.email,
      employee: employee.email,
      multiRoleUser: multiRoleUser.email,
      activeCycle: cycle.name
    });

    process.exit(0);
  } catch (error) {
    console.error("Seed failed", error);
    process.exit(1);
  }
};

seed();
