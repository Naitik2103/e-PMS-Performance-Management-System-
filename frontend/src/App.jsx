import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import RoleSelect from "./pages/RoleSelect";
import Dashboard from "./pages/Dashboard";
import Goals from "./pages/Goals";
import Tracking from "./pages/Tracking";
import Reviews from "./pages/Reviews";
import CreateNewUserPage from "./pages/admin/CreateNewUserPage";
import AdminCyclesPage from "./pages/admin/AdminCyclesPage";
import ManageParticipantsPage from "./pages/admin/ManageParticipantsPage";
import AdminUsersHubPage from "./pages/admin/AdminUsersHubPage";
import AdminPlaceholderPage from "./pages/admin/AdminPlaceholderPage";
import AllUsersPage from "./pages/admin/AllUsersPage";
import ReportingHierarchyPage from "./pages/admin/ReportingHierarchyPage";
import Unauthorized from "./pages/Unauthorized";
import { appRoutes } from "./rbac/accessMap";
import { useAuth } from "./context/AuthContext";
import { ROLES } from "./constants/rbac";

const App = () => {
  const { preAuth } = useAuth();

  const pageMap = {
    "/": <HomePage />,
    "/login": <Login />,
    "/reset-password": <ResetPassword />,
    "/select-role": preAuth?.token ? <RoleSelect /> : <Navigate to="/login" replace />,
    "/unauthorized": <Unauthorized />,

    "/dashboard": <Dashboard />,
    "/goals": <Goals />,
    "/tracking": <Tracking />,
    "/reviews": <Reviews />,

    "/admin-dashboard": <Navigate to="/admin/cycles" replace />,
    "/admin/cycles": <AdminCyclesPage />,
    "/admin/users": <AdminUsersHubPage />,
    "/admin/users/create": <CreateNewUserPage />,
    "/admin/departments": (
      <AdminPlaceholderPage title="Departments & Designations" description="Manage department and designation master data." />
    ),
    "/admin/analytics": <AdminPlaceholderPage title="Analytics" description="Workforce and appraisal analytics will appear here." />,
    "/admin/audit": <AdminPlaceholderPage title="Audit log" description="View administrative actions across the system." />,
    "/admin/all-users": <AllUsersPage />,
    "/admin/hierarchy": <ReportingHierarchyPage />,
    "/admin/create-user": <Navigate to="/admin/users/create" replace />
  };

  const staticRoutes = appRoutes.filter((r) => !String(r.path).includes(":"));

  return (
    <Routes>
      {staticRoutes.map((r) => {
        const element = pageMap[r.path];
        if (r.public) return <Route key={r.path} path={r.path} element={element} />;
        return (
          <Route
            key={r.path}
            path={r.path}
            element={
              <ProtectedRoute allowedRoles={r.roles}>
                {r.layout ? <Layout>{element}</Layout> : element}
              </ProtectedRoute>
            }
          />
        );
      })}

      <Route
        path="/admin/cycles/:cycleId/participants"
        element={
          <ProtectedRoute allowedRoles={[ROLES.HR_ADMIN]}>
            <Layout>
              <ManageParticipantsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route path="/admin" element={<Navigate to="/admin/cycles" replace />} />

      <Route path="/dashboard/employee" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard/ro" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard/revo" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard/ao" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard/admin" element={<Navigate to="/admin/cycles" replace />} />
      <Route path="/reporting-dashboard" element={<Navigate to="/dashboard" replace />} />
      <Route path="/reviewing-dashboard" element={<Navigate to="/dashboard" replace />} />
      <Route path="/accepting-dashboard" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
