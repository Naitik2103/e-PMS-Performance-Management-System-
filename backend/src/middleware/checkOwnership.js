import { ROLES, normalizeRole } from "../constants/rbac.js";

const ownershipError = { error: "This appraisal is not assigned to you" };

const checkAppraisalOwnership = (appraisal, role, userId) => {
  const normalizedRole = normalizeRole(role);
  if (!appraisal) return false;
  if (normalizedRole === ROLES.HR_ADMIN) return true;

  const employeeId = appraisal.employee_id || appraisal.employeeId;
  const roId = appraisal.ro_id || appraisal.roId;
  const revoId = appraisal.revo_id || appraisal.revoId;
  const aoId = appraisal.ao_id || appraisal.aoId;

  if (normalizedRole === ROLES.EMPLOYEE) return employeeId === userId;
  if (normalizedRole === ROLES.REPORTING_OFFICER) return roId === userId;
  if (normalizedRole === ROLES.REVIEWING_OFFICER) return revoId === userId;
  if (normalizedRole === ROLES.ACCEPTING_OFFICER) return aoId === userId;
  return false;
};

const enforceAppraisalOwnership = (appraisal, req, res) => {
  const ok = checkAppraisalOwnership(appraisal, req.user?.role, req.user?.userId);
  if (!ok) {
    res.status(403).json(ownershipError);
    return false;
  }
  return true;
};

export {
  checkAppraisalOwnership,
  enforceAppraisalOwnership,
  ownershipError
};
