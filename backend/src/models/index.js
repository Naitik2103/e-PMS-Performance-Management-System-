const { DataTypes, Model } = require("sequelize");
const bcrypt = require("bcryptjs");
const { sequelize } = require("../config/db");

class User extends Model {
  async matchPassword(password) {
    return bcrypt.compare(password, this.passwordHash);
  }

  static async hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    role: {
      type: DataTypes.ENUM("Employee", "ReportingOfficer", "ReviewingOfficer", "AcceptingOfficer", "Admin"),
      defaultValue: "Employee"
    },
    department: { type: DataTypes.STRING, allowNull: false },
    reportingTo: { type: DataTypes.UUID, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
  },
  {
    sequelize,
    tableName: "users",
    timestamps: true
  }
);

class Goal extends Model {}

Goal.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    year: { type: DataTypes.INTEGER, allowNull: false },
    status: {
      type: DataTypes.ENUM("draft", "submitted", "ro_approved", "rev_approved"),
      defaultValue: "draft"
    },
    kpas: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    totalWeight: { type: DataTypes.INTEGER, defaultValue: 0 },
    submittedAt: { type: DataTypes.DATE, allowNull: true },
    roApprovedAt: { type: DataTypes.DATE, allowNull: true },
    revApprovedAt: { type: DataTypes.DATE, allowNull: true },
    roApproverId: { type: DataTypes.UUID, allowNull: true },
    revApproverId: { type: DataTypes.UUID, allowNull: true }
  },
  {
    sequelize,
    tableName: "goals",
    timestamps: true,
    hooks: {
      beforeSave: (goal) => {
        goal.totalWeight = Array.isArray(goal.kpas)
          ? goal.kpas.reduce((sum, kpa) => sum + (Number(kpa.weight) || 0), 0)
          : 0;
      }
    }
  }
);

class SixMonthTracking extends Model {}

SixMonthTracking.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    goalId: { type: DataTypes.UUID, allowNull: false },
    year: { type: DataTypes.INTEGER, allowNull: false },
    period: { type: DataTypes.ENUM("H1", "H2"), allowNull: false },
    status: { type: DataTypes.ENUM("open", "ro_remarked", "closed"), defaultValue: "open" },
    progressEntries: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    roRemarks: { type: DataTypes.TEXT, allowNull: true }
  },
  {
    sequelize,
    tableName: "six_month_tracking",
    timestamps: true
  }
);

class YearEndReview extends Model {}

YearEndReview.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    year: { type: DataTypes.INTEGER, allowNull: false },
    status: {
      type: DataTypes.ENUM("draft", "submitted", "ro_rated", "review_approved", "accepted"),
      defaultValue: "draft"
    },
    selfSummary: { type: DataTypes.TEXT, allowNull: true },
    roRating: { type: DataTypes.JSONB, allowNull: true },
    roRemarks: { type: DataTypes.TEXT, allowNull: true },
    reviewingOfficerRemarks: { type: DataTypes.TEXT, allowNull: true },
    acceptingOfficerRemarks: { type: DataTypes.TEXT, allowNull: true },
    submittedAt: { type: DataTypes.DATE, allowNull: true },
    roRatedAt: { type: DataTypes.DATE, allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    acceptedAt: { type: DataTypes.DATE, allowNull: true }
  },
  {
    sequelize,
    tableName: "year_end_reviews",
    timestamps: true
  }
);

User.hasMany(Goal, { foreignKey: "employeeId", as: "goals" });
Goal.belongsTo(User, { foreignKey: "employeeId", as: "employee" });

User.hasMany(SixMonthTracking, { foreignKey: "employeeId", as: "tracking" });
SixMonthTracking.belongsTo(User, { foreignKey: "employeeId", as: "employee" });
SixMonthTracking.belongsTo(Goal, { foreignKey: "goalId", as: "goal" });

User.hasMany(YearEndReview, { foreignKey: "employeeId", as: "reviews" });
YearEndReview.belongsTo(User, { foreignKey: "employeeId", as: "employee" });

module.exports = {
  sequelize,
  User,
  Goal,
  SixMonthTracking,
  YearEndReview
};
