import { DataTypes, Model } from "sequelize";
import bcrypt from "bcryptjs";
import { sequelize } from "../config/db.js";
import { ROLES } from "../constants/rbac.js";

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
    firstName: { type: DataTypes.STRING, allowNull: true },
    lastName: { type: DataTypes.STRING, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    role: {
      type: DataTypes.ENUM(
        ROLES.EMPLOYEE,
        ROLES.REPORTING_OFFICER,
        ROLES.REVIEWING_OFFICER,
        ROLES.ACCEPTING_OFFICER,
        ROLES.HR_ADMIN,
        "Employee",
        "ReportingOfficer",
        "ReviewingOfficer",
        "AcceptingOfficer",
        "Admin"
      ),
      allowNull: false,
      defaultValue: ROLES.EMPLOYEE
    },
    department: { type: DataTypes.STRING, allowNull: false },
    reportingTo: { type: DataTypes.UUID, allowNull: true },
    reviewingOfficerId: { type: DataTypes.UUID, allowNull: true },
    acceptingOfficerId: { type: DataTypes.UUID, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  },
  {
    sequelize,
    tableName: "users",
    timestamps: true
  }
);

class AuthSession extends Model {}

AuthSession.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: { type: DataTypes.UUID, allowNull: false },
    tokenId: { type: DataTypes.STRING, allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    isRevoked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    revokedAt: { type: DataTypes.DATE, allowNull: true }
  },
  {
    sequelize,
    tableName: "auth_sessions",
    timestamps: true
  }
);

class AppraisalCycle extends Model {}

AppraisalCycle.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: { type: DataTypes.STRING, allowNull: false },
    year: { type: DataTypes.INTEGER, allowNull: false },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    goalSettingStart: { type: DataTypes.DATEONLY, allowNull: true },
    goalSettingEnd: { type: DataTypes.DATEONLY, allowNull: true },
    sixMonthProgressReviewStart: { type: DataTypes.DATEONLY, allowNull: true },
    sixMonthProgressReviewEnd: { type: DataTypes.DATEONLY, allowNull: true },
    annualAppraisalStart: { type: DataTypes.DATEONLY, allowNull: true },
    annualAppraisalEnd: { type: DataTypes.DATEONLY, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    status: {
      type: DataTypes.ENUM("draft", "active", "closed"),
      allowNull: false,
      defaultValue: "draft"
    }
  },
  {
    sequelize,
    tableName: "appraisal_cycles",
    timestamps: true,
    indexes: [{ unique: true, fields: ["year"] }]
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
    userId: { type: DataTypes.UUID, allowNull: false },
    cycleId: { type: DataTypes.UUID, allowNull: false },
    goalTitle: { type: DataTypes.STRING, allowNull: false },
    goalDescription: { type: DataTypes.TEXT, allowNull: true },
    weightage: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
    status: {
      type: DataTypes.ENUM("draft", "submitted", "approved", "rejected", "returned"),
      allowNull: false,
      defaultValue: "draft"
    },
    submittedAt: { type: DataTypes.DATE, allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    reviewedBy: { type: DataTypes.UUID, allowNull: true },
    reviewerRole: { type: DataTypes.STRING, allowNull: true },
    reviewRemarks: { type: DataTypes.TEXT, allowNull: true }
  },
  {
    sequelize,
    tableName: "goals",
    timestamps: true,
    indexes: [{ fields: ["userId", "cycleId"] }]
  }
);

class SixMonthReview extends Model {}

SixMonthReview.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    goalId: { type: DataTypes.UUID, allowNull: false },
    cycleId: { type: DataTypes.UUID, allowNull: false },
    period: { type: DataTypes.ENUM("H1", "H2"), allowNull: false },
    progressText: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.ENUM("draft", "submitted"),
      allowNull: false,
      defaultValue: "draft"
    },
    reportingRemarks: { type: DataTypes.TEXT, allowNull: true },
    submittedAt: { type: DataTypes.DATE, allowNull: true },
    remarkedAt: { type: DataTypes.DATE, allowNull: true }
  },
  {
    sequelize,
    tableName: "six_month_reviews",
    timestamps: true,
    indexes: [{ unique: true, fields: ["employeeId", "goalId", "cycleId", "period"] }]
  }
);

class AnnualSelfAppraisal extends Model {}

AnnualSelfAppraisal.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    cycleId: { type: DataTypes.UUID, allowNull: false },
    selfSummary: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.ENUM("draft", "submitted", "ro_reviewed", "revo_reviewed", "ao_finalized"),
      allowNull: false,
      defaultValue: "submitted"
    },
    submittedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  },
  {
    sequelize,
    tableName: "annual_self_appraisals",
    timestamps: true,
    indexes: [{ unique: true, fields: ["employeeId", "cycleId"] }]
  }
);

class SelfAppraisalGoalRating extends Model {}

SelfAppraisalGoalRating.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    selfAppraisalId: { type: DataTypes.UUID, allowNull: false },
    goalId: { type: DataTypes.UUID, allowNull: false },
    achievementText: { type: DataTypes.TEXT, allowNull: true },
    selfRating: { type: DataTypes.INTEGER, allowNull: true },
    roRating: { type: DataTypes.INTEGER, allowNull: true },
    revoRating: { type: DataTypes.INTEGER, allowNull: true },
    aoRating: { type: DataTypes.INTEGER, allowNull: true }
  },
  {
    sequelize,
    tableName: "self_appraisal_goal_ratings",
    timestamps: true,
    indexes: [{ name: "uq_self_appraisal_goal", unique: true, fields: ["selfAppraisalId", "goalId"] }]
  }
);

class PerformanceReview extends Model {}

PerformanceReview.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    cycleId: { type: DataTypes.UUID, allowNull: false },
    selfAppraisalId: { type: DataTypes.UUID, allowNull: false },
    status: {
      type: DataTypes.ENUM("pending_ro", "pending_revo", "pending_ao", "finalized", "returned", "rejected"),
      allowNull: false,
      defaultValue: "pending_ro"
    },
    roRemarks: { type: DataTypes.TEXT, allowNull: true },
    revoRemarks: { type: DataTypes.TEXT, allowNull: true },
    aoRemarks: { type: DataTypes.TEXT, allowNull: true },
    roScore: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
    revoScore: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
    aoScore: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
    finalScore: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
    roReviewedAt: { type: DataTypes.DATE, allowNull: true },
    revoReviewedAt: { type: DataTypes.DATE, allowNull: true },
    aoReviewedAt: { type: DataTypes.DATE, allowNull: true }
  },
  {
    sequelize,
    tableName: "performance_reviews",
    timestamps: true,
    indexes: [{ name: "uq_performance_review_emp_cycle", unique: true, fields: ["employeeId", "cycleId"] }]
  }
);

class QuantitativeAttributeMaster extends Model {}

QuantitativeAttributeMaster.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    category: {
      type: DataTypes.ENUM("Values", "Competencies", "Personal Qualities", "Knowledge"),
      allowNull: false
    },
    attributeName: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  },
  {
    sequelize,
    tableName: "quantitative_attributes_master",
    timestamps: true
  }
);

class QuantitativeAttributeRating extends Model {}

QuantitativeAttributeRating.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    reviewId: { type: DataTypes.UUID, allowNull: false },
    attributeId: { type: DataTypes.UUID, allowNull: false },
    ratedBy: { type: DataTypes.UUID, allowNull: false },
    ratedByRole: {
      type: DataTypes.ENUM(
        ROLES.REPORTING_OFFICER,
        ROLES.REVIEWING_OFFICER,
        ROLES.ACCEPTING_OFFICER,
        "ReportingOfficer",
        "ReviewingOfficer",
        "AcceptingOfficer"
      ),
      allowNull: false
    },
    rating: { type: DataTypes.INTEGER, allowNull: false },
    remarks: { type: DataTypes.TEXT, allowNull: true }
  },
  {
    sequelize,
    tableName: "quantitative_attribute_ratings",
    timestamps: true,
    indexes: [{ name: "uq_quant_attr_rating", unique: true, fields: ["reviewId", "attributeId", "ratedByRole"] }]
  }
);

class Notification extends Model {}

Notification.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    type: { type: DataTypes.STRING, allowNull: false },
    entity: { type: DataTypes.STRING, allowNull: true },
    entityId: { type: DataTypes.UUID, allowNull: true },
    isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    readAt: { type: DataTypes.DATE, allowNull: true }
  },
  {
    sequelize,
    tableName: "notifications",
    timestamps: true
  }
);

class AuditLog extends Model {}

AuditLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: { type: DataTypes.UUID, allowNull: true },
    role: { type: DataTypes.STRING, allowNull: true },
    action: { type: DataTypes.STRING, allowNull: false },
    entity: { type: DataTypes.STRING, allowNull: false },
    entityId: { type: DataTypes.UUID, allowNull: true },
    details: { type: DataTypes.JSONB, allowNull: true }
  },
  {
    sequelize,
    tableName: "audit_logs",
    timestamps: true,
    updatedAt: false
  }
);

User.hasMany(User, { foreignKey: "reportingTo", as: "directReports" });
User.belongsTo(User, { foreignKey: "reportingTo", as: "manager" });

User.hasMany(AuthSession, { foreignKey: "userId", as: "sessions" });
AuthSession.belongsTo(User, { foreignKey: "userId", as: "user" });

AppraisalCycle.hasMany(Goal, { foreignKey: "cycleId", as: "goals" });
Goal.belongsTo(AppraisalCycle, { foreignKey: "cycleId", as: "cycle" });
User.hasMany(Goal, { foreignKey: "userId", as: "goals" });
Goal.belongsTo(User, { foreignKey: "userId", as: "employee" });

User.hasMany(SixMonthReview, { foreignKey: "employeeId", as: "sixMonthReviews" });
SixMonthReview.belongsTo(User, { foreignKey: "employeeId", as: "employee" });
Goal.hasMany(SixMonthReview, { foreignKey: "goalId", as: "sixMonthReviews" });
SixMonthReview.belongsTo(Goal, { foreignKey: "goalId", as: "goal" });
AppraisalCycle.hasMany(SixMonthReview, { foreignKey: "cycleId", as: "sixMonthReviews" });
SixMonthReview.belongsTo(AppraisalCycle, { foreignKey: "cycleId", as: "cycle" });

User.hasMany(AnnualSelfAppraisal, { foreignKey: "employeeId", as: "selfAppraisals" });
AnnualSelfAppraisal.belongsTo(User, { foreignKey: "employeeId", as: "employee" });
AppraisalCycle.hasMany(AnnualSelfAppraisal, { foreignKey: "cycleId", as: "selfAppraisals" });
AnnualSelfAppraisal.belongsTo(AppraisalCycle, { foreignKey: "cycleId", as: "cycle" });

AnnualSelfAppraisal.hasMany(SelfAppraisalGoalRating, { foreignKey: "selfAppraisalId", as: "goalRatings", onDelete: "CASCADE" });
SelfAppraisalGoalRating.belongsTo(AnnualSelfAppraisal, { foreignKey: "selfAppraisalId", as: "selfAppraisal" });
Goal.hasMany(SelfAppraisalGoalRating, { foreignKey: "goalId", as: "goalRatings" });
SelfAppraisalGoalRating.belongsTo(Goal, { foreignKey: "goalId", as: "goal" });

User.hasMany(PerformanceReview, { foreignKey: "employeeId", as: "reviews" });
PerformanceReview.belongsTo(User, { foreignKey: "employeeId", as: "employee" });
AppraisalCycle.hasMany(PerformanceReview, { foreignKey: "cycleId", as: "reviews" });
PerformanceReview.belongsTo(AppraisalCycle, { foreignKey: "cycleId", as: "cycle" });
AnnualSelfAppraisal.hasOne(PerformanceReview, { foreignKey: "selfAppraisalId", as: "review" });
PerformanceReview.belongsTo(AnnualSelfAppraisal, { foreignKey: "selfAppraisalId", as: "selfAppraisal" });

PerformanceReview.hasMany(QuantitativeAttributeRating, { foreignKey: "reviewId", as: "attributeRatings", onDelete: "CASCADE" });
QuantitativeAttributeRating.belongsTo(PerformanceReview, { foreignKey: "reviewId", as: "review" });
QuantitativeAttributeMaster.hasMany(QuantitativeAttributeRating, { foreignKey: "attributeId", as: "ratings" });
QuantitativeAttributeRating.belongsTo(QuantitativeAttributeMaster, { foreignKey: "attributeId", as: "attribute" });
User.hasMany(QuantitativeAttributeRating, { foreignKey: "ratedBy", as: "givenAttributeRatings" });
QuantitativeAttributeRating.belongsTo(User, { foreignKey: "ratedBy", as: "rater" });

User.hasMany(Notification, { foreignKey: "userId", as: "notifications" });
Notification.belongsTo(User, { foreignKey: "userId", as: "recipient" });

User.hasMany(AuditLog, { foreignKey: "userId", as: "auditLogs" });
AuditLog.belongsTo(User, { foreignKey: "userId", as: "actor" });

export {
  sequelize,
  User,
  AuthSession,
  AppraisalCycle,
  Goal,
  SixMonthReview,
  AnnualSelfAppraisal,
  SelfAppraisalGoalRating,
  PerformanceReview,
  QuantitativeAttributeMaster,
  QuantitativeAttributeRating,
  Notification,
  AuditLog
};
