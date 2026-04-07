export const ROLES = Object.freeze({
  EMPLOYEE: "employee",
  REPORTING_OFFICER: "reporting_officer",
  REVIEWING_OFFICER: "reviewing_officer",
  ACCEPTING_OFFICER: "accepting_officer",
  HR_ADMIN: "hr_admin",
});

const LEGACY_TO_PRD_ROLE = Object.freeze({
  Employee: ROLES.EMPLOYEE,
  ReportingOfficer: ROLES.REPORTING_OFFICER,
  ReviewingOfficer: ROLES.REVIEWING_OFFICER,
  AcceptingOfficer: ROLES.ACCEPTING_OFFICER,
  Admin: ROLES.HR_ADMIN,
});

export const normalizeRole = (role) => LEGACY_TO_PRD_ROLE[role] || role;

export const roleMatches = (actualRole, expectedRole) =>
  normalizeRole(actualRole) === normalizeRole(expectedRole);

export const roleLabel = (role) => {
  const normalized = normalizeRole(role);
  switch (normalized) {
    case ROLES.EMPLOYEE:
      return "Employee";
    case ROLES.REPORTING_OFFICER:
      return "Reporting Officer";
    case ROLES.REVIEWING_OFFICER:
      return "Reviewing Officer";
    case ROLES.ACCEPTING_OFFICER:
      return "Accepting Officer";
    case ROLES.HR_ADMIN:
      return "HR Admin";
    default:
      return role || "User";
  }
};
