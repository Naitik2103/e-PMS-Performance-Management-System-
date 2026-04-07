import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Target,
  BarChart2,
  ClipboardList,
  Users,
  UserPlus,
  CalendarDays,
  Network,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ROLES, roleLabel } from "../constants/rbac";

const roleHomeMap = {
  [ROLES.EMPLOYEE]: "/dashboard",
  [ROLES.REPORTING_OFFICER]: "/reporting-dashboard",
  [ROLES.REVIEWING_OFFICER]: "/reviewing-dashboard",
  [ROLES.ACCEPTING_OFFICER]: "/accepting-dashboard",
  [ROLES.HR_ADMIN]: "/admin-dashboard",
};

const navItems = [
  {
    to: (role) => roleHomeMap[role] || "/dashboard",
    icon: LayoutDashboard,
    label: "Dashboard",
    roles: [ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER, ROLES.REVIEWING_OFFICER, ROLES.ACCEPTING_OFFICER, ROLES.HR_ADMIN],
  },
  {
    to: "/goals",
    icon: Target,
    label: "Goals",
    roles: [ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER, ROLES.REVIEWING_OFFICER],
  },
  {
    to: "/tracking",
    icon: BarChart2,
    label: "Six-Month Tracking",
    roles: [ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER],
  },
  {
    to: "/reviews",
    icon: ClipboardList,
    label: "Year-End Reviews",
    roles: [ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER, ROLES.REVIEWING_OFFICER, ROLES.ACCEPTING_OFFICER],
  },
  {
    to: "/admin-dashboard",
    icon: Users,
    label: "Admin Panel",
    roles: [ROLES.HR_ADMIN],
  },
  {
    to: "/admin/create-user",
    icon: UserPlus,
    label: "Create New User",
    roles: [ROLES.HR_ADMIN],
  },
  {
    to: "/admin/cycles",
    icon: CalendarDays,
    label: "Appraisal Cycle Management",
    roles: [ROLES.HR_ADMIN],
  },
  {
    to: "/admin/all-users",
    icon: Users,
    label: "All Users",
    roles: [ROLES.HR_ADMIN],
  },
  {
    to: "/admin/hierarchy",
    icon: Network,
    label: "Reporting Hierarchy",
    roles: [ROLES.HR_ADMIN],
  },
];

const Sidebar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo-mark">e</div>
        <span className="sidebar-logo-text">e-PMS</span>
      </div>

      <nav className="sidebar-nav">
        {navItems
          .filter((item) => !role || item.roles.includes(role))
          .map((item) => {
            const to = typeof item.to === "function" ? item.to(role) : item.to;
            const Icon = item.icon;
            return (
              <NavLink key={to} to={to} className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
                <Icon size={18} className="sidebar-icon" />
                <span>{item.label}</span>
                <ChevronRight size={14} className="sidebar-chevron" />
              </NavLink>
            );
          })}
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
