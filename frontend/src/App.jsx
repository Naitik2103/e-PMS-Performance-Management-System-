import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Goals from "./pages/Goals";
import Tracking from "./pages/Tracking";
import Reviews from "./pages/Reviews";
import Admin from "./pages/Admin";
import CreateNewUserPage from "./pages/admin/CreateNewUserPage";
import AppraisalCycleManagementPage from "./pages/admin/AppraisalCycleManagementPage";
import AllUsersPage from "./pages/admin/AllUsersPage";
import ReportingHierarchyPage from "./pages/admin/ReportingHierarchyPage";
import { ROLES } from "./constants/rbac";

const App = () => {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<Login />} />

      {/* Role-based dashboard routes — all use the same Layout+Dashboard */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/employee"
        element={
          <ProtectedRoute allowedRoles={[ROLES.EMPLOYEE]}>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/ro"
        element={
          <ProtectedRoute allowedRoles={[ROLES.REPORTING_OFFICER]}>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/revo"
        element={
          <ProtectedRoute allowedRoles={[ROLES.REVIEWING_OFFICER]}>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/ao"
        element={
          <ProtectedRoute allowedRoles={[ROLES.ACCEPTING_OFFICER]}>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/admin"
        element={
          <ProtectedRoute allowedRoles={[ROLES.HR_ADMIN]}>
            <Layout>
              <Admin />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reporting-dashboard"
        element={
          <ProtectedRoute roles={[ROLES.REPORTING_OFFICER]}>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reviewing-dashboard"
        element={
          <ProtectedRoute roles={[ROLES.REVIEWING_OFFICER]}>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/accepting-dashboard"
        element={
          <ProtectedRoute roles={[ROLES.ACCEPTING_OFFICER]}>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin-dashboard"
        element={
          <ProtectedRoute roles={[ROLES.HR_ADMIN]}>
            <Layout>
              <Admin />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/create-user"
        element={
          <ProtectedRoute roles={[ROLES.HR_ADMIN]}>
            <Layout>
              <CreateNewUserPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/cycles"
        element={
          <ProtectedRoute roles={[ROLES.HR_ADMIN]}>
            <Layout>
              <AppraisalCycleManagementPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/all-users"
        element={
          <ProtectedRoute roles={[ROLES.HR_ADMIN]}>
            <Layout>
              <AllUsersPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/hierarchy"
        element={
          <ProtectedRoute roles={[ROLES.HR_ADMIN]}>
            <Layout>
              <ReportingHierarchyPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Shared feature routes */}
      <Route
        path="/goals"
        element={
          <ProtectedRoute>
            <Layout>
              <Goals />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tracking"
        element={
          <ProtectedRoute>
            <Layout>
              <Tracking />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reviews"
        element={
          <ProtectedRoute>
            <Layout>
              <Reviews />
            </Layout>
          </ProtectedRoute>
        }
      />
      {/* Legacy /admin alias */}
      <Route path="/admin" element={<Navigate to="/admin-dashboard" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
