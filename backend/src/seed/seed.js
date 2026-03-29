const dotenv = require("dotenv");
const { connectDb } = require("../config/db");
const { sequelize, User, AppraisalCycle, QuantitativeAttributeMaster } = require("../models");

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
      name: "System Admin",
      email: "admin@epms.local",
      passwordHash: adminPassword,
      role: "Admin",
      department: "Administration"
    });

    const acceptingOfficer = await User.create({
      name: "Ava Accept",
      email: "accepting@epms.local",
      passwordHash: acceptingPassword,
      role: "AcceptingOfficer",
      department: "Central Office"
    });

    const reviewingOfficer = await User.create({
      name: "Riya Review",
      email: "reviewing@epms.local",
      passwordHash: reviewingPassword,
      role: "ReviewingOfficer",
      department: "Central Office",
      reportingTo: acceptingOfficer.id
    });

    const reportingOfficer = await User.create({
      name: "Rohan Report",
      email: "reporting@epms.local",
      passwordHash: reportingPassword,
      role: "ReportingOfficer",
      department: "Computer Science",
      reportingTo: reviewingOfficer.id
    });

    const employee = await User.create({
      name: "Emma Employee",
      email: "employee@epms.local",
      passwordHash: employeePassword,
      role: "Employee",
      department: "Computer Science",
      reportingTo: reportingOfficer.id
    });

    const year = new Date().getFullYear();
    const cycle = await AppraisalCycle.create({
      name: `Annual Appraisal ${year}`,
      year,
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
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
      activeCycle: cycle.name
    });

    process.exit(0);
  } catch (error) {
    console.error("Seed failed", error);
    process.exit(1);
  }
};

seed();
