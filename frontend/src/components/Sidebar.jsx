import React, { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LogOut, ChevronRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { roleLabel, ROLES } from "../constants/rbac";
import { sidebarItems, adminNavItems } from "../rbac/accessMap";
import { apiClient } from "../api/client";

const Sidebar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = user?.selectedRole || user?.role;
  const [accessWindow, setAccessWindow] = useState(null);
  const sixMonthState = accessWindow?.sixMonthState || null;
  const annualState = accessWindow?.annualState || null;

  useEffect(() => {
    let alive = true;
    const loadAccess = async () => {
      if (role !== ROLES.EMPLOYEE) {
        setAccessWindow(null);
        return;
      }
      try {
        const res = await apiClient.get("/appraisals/access-window");
        if (alive) setAccessWindow(res.data?.access || null);
      } catch {
        if (alive) setAccessWindow(null);
      }
    };
    loadAccess();
    return () => {
      alive = false;
    };
  }, [role]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  const cycleParticipantsMatch = location.pathname.match(/^\/admin\/cycles\/([^/]+)\/participants$/);

  const renderHrAdminNav = () => (
    <>
      {adminNavItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.key}
            to={item.path}
            end={item.path === "/admin/cycles"}
            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
          >
            <Icon size={18} className="sidebar-icon" />
            <span>{item.label}</span>
            <ChevronRight size={14} className="sidebar-chevron" />
          </NavLink>
        );
      })}
      {cycleParticipantsMatch && (
        <NavLink
          to={location.pathname}
          className={({ isActive }) => `sidebar-link sidebar-link--sub${isActive ? " active" : ""}`}
        >
          <span className="sidebar-sub-bullet">└</span>
          <span>Manage participants</span>
        </NavLink>
      )}
    </>
  );

  const renderStandardNav = () =>
    sidebarItems
      .filter((item) => !role || item.roles.includes(role))
      .filter((item) => {
        if (role !== ROLES.EMPLOYEE) return true;
        // Keep Tracking/Reviews visible (disabled if outside their access window).
        return true;
      })
      .map((item) => {
        const to = typeof item.to === "function" ? item.to(role) : item.to;
        const Icon = item.icon;
        if (role === ROLES.EMPLOYEE && item.key === "tracking" && sixMonthState !== "open") {
          const msg =
            sixMonthState === "not_started"
              ? "Six-month progress period has not started yet."
              : sixMonthState === "closed"
                ? "Six-month progress period is closed."
                : "Six-month progress period is not available.";
          return (
            <div
              key={item.key}
              className="sidebar-link"
              style={{ opacity: 0.6, pointerEvents: "none" }}
              title={msg}
            >
              <Icon size={18} className="sidebar-icon" />
              <div>
                <span>{item.label}</span>
                <div style={{ fontSize: 12, color: "#8a8a8a", marginTop: 2 }}>{msg}</div>
              </div>
              <ChevronRight size={14} className="sidebar-chevron" />
            </div>
          );
        }
        if (role === ROLES.EMPLOYEE && item.key === "reviews" && annualState !== "open") {
          const msg =
            annualState === "not_started"
              ? "Annual appraisal period has not started yet."
              : annualState === "closed"
                ? "Annual appraisal period is closed."
                : "Annual appraisal period is not available.";
          return (
            <div
              key={item.key}
              className="sidebar-link"
              style={{ opacity: 0.6, pointerEvents: "none" }}
              title={msg}
            >
              <Icon size={18} className="sidebar-icon" />
              <div>
                <span>{item.label}</span>
                <div style={{ fontSize: 12, color: "#8a8a8a", marginTop: 2 }}>{msg}</div>
              </div>
              <ChevronRight size={14} className="sidebar-chevron" />
            </div>
          );
        }
        return (
          <NavLink key={item.key} to={to} className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
            <Icon size={18} className="sidebar-icon" />
            <span>{item.label}</span>
            <ChevronRight size={14} className="sidebar-chevron" />
          </NavLink>
        );
      });

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo-mark">e</div>
        <span className="sidebar-logo-text">e-PMS</span>
      </div>

      <nav className="sidebar-nav">
        {role === ROLES.HR_ADMIN ? renderHrAdminNav() : renderStandardNav()}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.name || "User"}</div>
            <div className="sidebar-user-role">{roleLabel(role)}</div>
          </div>
        </div>
        <button className="sidebar-logout" onClick={handleLogout} title="Logout">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
