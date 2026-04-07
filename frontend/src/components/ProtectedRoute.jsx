import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ROLES, roleMatches } from "../constants/rbac";

const ROLE_DASHBOARD = {
  [ROLES.EMPLOYEE]: "/dashboard/employee",
  [ROLES.REPORTING_OFFICER]: "/dashboard/ro",
  [ROLES.REVIEWING_OFFICER]: "/dashboard/revo",
  [ROLES.ACCEPTING_OFFICER]: "/dashboard/ao",
  [ROLES.HR_ADMIN]: "/dashboard/admin"
};

const ProtectedRoute = ({ children, roles, allowedRoles }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="page-loading">Loading...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  const expected = allowedRoles || roles;
  if (expected && !expected.some((role) => roleMatches(user.role, role))) {
    return <Navigate to={ROLE_DASHBOARD[user.role] || "/dashboard"} replace />;
  }
  return children;
};

export default ProtectedRoute;
