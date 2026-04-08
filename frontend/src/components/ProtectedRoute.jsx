import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { roleMatches } from "../constants/rbac";

const ProtectedRoute = ({ children, roles, allowedRoles }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="page-loading">Loading...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  const expected = allowedRoles || roles;
  const activeRole = user.selectedRole || user.role;
  if (expected && !expected.some((role) => roleMatches(activeRole, role))) {
    return <Navigate to="/unauthorized" replace />;
  }
  return children;
};

export default ProtectedRoute;
