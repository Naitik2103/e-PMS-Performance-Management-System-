const ROLES = Object.freeze({
  EMPLOYEE: "employee",
  REPORTING_OFFICER: "reporting_officer",
  REVIEWING_OFFICER: "reviewing_officer",
  ACCEPTING_OFFICER: "accepting_officer",
  HR_ADMIN: "hr_admin"
});

const LEGACY_TO_PRD_ROLE = Object.freeze({
  Employee: ROLES.EMPLOYEE,
  ReportingOfficer: ROLES.REPORTING_OFFICER,
  ReviewingOfficer: ROLES.REVIEWING_OFFICER,
  AcceptingOfficer: ROLES.ACCEPTING_OFFICER,
  Admin: ROLES.HR_ADMIN
});

const PRD_TO_LEGACY_ROLE = Object.freeze(
  Object.entries(LEGACY_TO_PRD_ROLE).reduce((acc, [legacy, prd]) => {
    acc[prd] = legacy;
    return acc;
  }, {})
);

const normalizeRole = (role) => LEGACY_TO_PRD_ROLE[role] || role;

const roleMatches = (actualRole, expectedRole) => normalizeRole(actualRole) === normalizeRole(expectedRole);

const anyRoleMatches = (actualRole, expectedRoles = []) =>
  expectedRoles.some((expectedRole) => roleMatches(actualRole, expectedRole));

const isOfficerRole = (role) =>
  [ROLES.REPORTING_OFFICER, ROLES.REVIEWING_OFFICER, ROLES.ACCEPTING_OFFICER].includes(normalizeRole(role));

export {
  ROLES,
  LEGACY_TO_PRD_ROLE,
  PRD_TO_LEGACY_ROLE,
  normalizeRole,
  roleMatches,
  anyRoleMatches,
  isOfficerRole
};
