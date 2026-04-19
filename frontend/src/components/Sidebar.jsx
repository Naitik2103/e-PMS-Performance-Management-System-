import React, { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LogOut, ChevronRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { roleLabel, ROLES } from "../constants/rbac";
import { sidebarItems, adminNavItems } from "../rbac/accessMap";
import { apiClient } from "../api/client";

const Sidebar = ({ isOpen = false, onCloseMobile }) => {
  const { user, logout, activeCycle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = user?.selectedRole || user?.role;
  const [accessWindow, setAccessWindow] = useState(null);

  const getDateOnly = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  };

  const getWindowState = (startDate, endDate) => {
    const start = getDateOnly(startDate);
    const end = getDateOnly(endDate);
    if (!start || !end) return null;
    const now = getDateOnly(new Date());
    if (now < start) return "not_started";
    if (now > end) return "closed";
    return "open";
  };

  const resolveWindowState = (flag, startDate, endDate) => {
    if (typeof flag === "boolean") {
      if (flag) return "open";
      const byDate = getWindowState(startDate, endDate);
      return byDate || "closed";
    }
    return getWindowState(startDate, endDate);
  };

  const officerGoalState = resolveWindowState(
    activeCycle?.isGoalSettingActive,
    activeCycle?.goalSettingStart,
    activeCycle?.goalSettingEnd
  );
  const officerSixMonthState = resolveWindowState(
    activeCycle?.isSixMonthReviewActive,
    activeCycle?.sixMonthProgressReviewStart,
    activeCycle?.sixMonthProgressReviewEnd
  );
  const officerAnnualState = resolveWindowState(
    activeCycle?.isAnnualAppraisalActive,
    activeCycle?.annualAppraisalStart,
    activeCycle?.annualAppraisalEnd
  );

  const goalState = role === ROLES.EMPLOYEE ? "open" : officerGoalState;
  const sixMonthState = role === ROLES.EMPLOYEE ? (accessWindow?.sixMonthState || null) : officerSixMonthState;
  const annualState = role === ROLES.EMPLOYEE ? (accessWindow?.annualState || null) : officerAnnualState;

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

  const handleNavNavigate = () => {
    if (typeof onCloseMobile === "function") onCloseMobile();
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
            onClick={handleNavNavigate}
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
          onClick={handleNavNavigate}
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
        // Keep all items visible for eligible roles; apply period gating via disabled state.
        return true;
      })
      .map((item) => {
        const to = typeof item.to === "function" ? item.to(role) : item.to;
        const target = item.key === "goals" ? { pathname: to, search: "" } : to;
        const Icon = item.icon;

        const periodStateByKey = {
          goals: goalState,
          tracking: sixMonthState,
          reviews: annualState
        };
        const state = periodStateByKey[item.key] || "open";
        const shouldGateGoal = item.key === "goals" && [ROLES.REPORTING_OFFICER, ROLES.REVIEWING_OFFICER, ROLES.ACCEPTING_OFFICER].includes(role);
        const shouldGateTracking = item.key === "tracking" && [ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER].includes(role);
        const shouldGateReviews = item.key === "reviews" && [ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER, ROLES.REVIEWING_OFFICER, ROLES.ACCEPTING_OFFICER].includes(role);
        const shouldGate = shouldGateGoal || shouldGateTracking || shouldGateReviews;

        const labelByKey = {
          goals: "Goal setting period",
          tracking: "Six-month progress period",
          reviews: "Annual appraisal period"
        };

        if (shouldGate && state !== "open") {
          const label = labelByKey[item.key] || "Access period";
          const msg =
            state === "not_started"
              ? `${label} has not started yet.`
              : state === "closed"
                ? `${label} is closed.`
                : `${label} is not available.`;
          
          if (item.key === "tracking") {
            return (
              <NavLink
                key={item.key}
                to={target}
                onClick={handleNavNavigate}
                className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
                style={{ opacity: 0.6 }}
              >
                <Icon size={18} className="sidebar-icon" />
                <div>
                  <span>{item.label}</span>
                  <div style={{ fontSize: 12, color: "#8a8a8a", marginTop: 2 }}>{msg}</div>
                </div>
                <ChevronRight size={14} className="sidebar-chevron" />
              </NavLink>
            );
          }

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

        if (role === ROLES.EMPLOYEE && item.key === "tracking" && sixMonthState !== "open") {
          const msg =
            sixMonthState === "not_started"
              ? "Six-month progress period has not started yet."
              : sixMonthState === "closed"
                ? "Six-month progress period is closed."
                : "Six-month progress period is not available.";
          return (
            <NavLink
              key={item.key}
              to={target}
              onClick={handleNavNavigate}
              className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
              style={{ opacity: 0.6 }}
            >
              <Icon size={18} className="sidebar-icon" />
              <div>
                <span>{item.label}</span>
                <div style={{ fontSize: 12, color: "#8a8a8a", marginTop: 2 }}>{msg}</div>
              </div>
              <ChevronRight size={14} className="sidebar-chevron" />
            </NavLink>
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
          <NavLink key={item.key} to={target} onClick={handleNavNavigate} className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
            <Icon size={18} className="sidebar-icon" />
            <span>{item.label}</span>
            <ChevronRight size={14} className="sidebar-chevron" />
          </NavLink>
        );
      });

  return (
    <aside className={`sidebar${isOpen ? " open" : ""}`}>
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
