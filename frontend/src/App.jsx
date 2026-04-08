import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import Login from "./pages/Login";
import RoleSelect from "./pages/RoleSelect";
import Dashboard from "./pages/Dashboard";
import Goals from "./pages/Goals";
import Tracking from "./pages/Tracking";
import Reviews from "./pages/Reviews";
import Admin from "./pages/Admin";
import CreateNewUserPage from "./pages/admin/CreateNewUserPage";
import AppraisalCycleManagementPage from "./pages/admin/AppraisalCycleManagementPage";
import AllUsersPage from "./pages/admin/AllUsersPage";
import ReportingHierarchyPage from "./pages/admin/ReportingHierarchyPage";
import Unauthorized from "./pages/Unauthorized";
import { appRoutes } from "./rbac/accessMap";
import { useAuth } from "./context/AuthContext";

const App = () => {
  const { preAuth } = useAuth();

  const pageMap = {
    "/": <HomePage />,
    "/login": <Login />,
    "/select-role": preAuth?.token ? <RoleSelect /> : <Navigate to="/login" replace />,
    "/unauthorized": <Unauthorized />,

    "/dashboard": <Dashboard />,
    "/goals": <Goals />,
    "/tracking": <Tracking />,
    "/reviews": <Reviews />,

    "/admin-dashboard": <Admin />,
    "/admin/create-user": <CreateNewUserPage />,
    "/admin/cycles": <AppraisalCycleManagementPage />,
    "/admin/all-users": <AllUsersPage />,
    "/admin/hierarchy": <ReportingHierarchyPage />,
  };

  return (
    <Routes>
      {appRoutes.map((r) => {
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

      {/* Legacy aliases */}
      <Route path="/admin" element={<Navigate to="/admin-dashboard" replace />} />
      <Route path="/dashboard/employee" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard/ro" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard/revo" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard/ao" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard/admin" element={<Navigate to="/admin-dashboard" replace />} />
      <Route path="/reporting-dashboard" element={<Navigate to="/dashboard" replace />} />
      <Route path="/reviewing-dashboard" element={<Navigate to="/dashboard" replace />} />
      <Route path="/accepting-dashboard" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
