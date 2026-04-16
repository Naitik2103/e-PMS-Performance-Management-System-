import {
  LayoutDashboard,
  Target,
  BarChart2,
  ClipboardList,
  Users,
  CalendarDays,
  Network,
  Building2,
  FileText,
} from "lucide-react";

import { ROLES } from "../constants/rbac";

const ALL_AUTHED = Object.freeze([
  ROLES.EMPLOYEE,
  ROLES.REPORTING_OFFICER,
  ROLES.REVIEWING_OFFICER,
  ROLES.ACCEPTING_OFFICER,
  ROLES.HR_ADMIN,
]);

export const roleHomePath = (role) => (role === ROLES.HR_ADMIN ? "/admin/cycles" : "/dashboard");

/** Static admin sidebar (HR admin only). */
export const adminNavItems = Object.freeze([
  { label: "Appraisal cycles", path: "/admin/cycles", key: "ac", icon: CalendarDays },
  { label: "User management", path: "/admin/users", key: "um", icon: Users },
  { label: "Departments & Designations", path: "/admin/departments", key: "dd", icon: Building2 },
  { label: "Analytics", path: "/admin/analytics", key: "an", icon: BarChart2 },
  { label: "Audit log", path: "/admin/audit", key: "al", icon: FileText },
]);

export const appRoutes = Object.freeze([
  { path: "/", public: true },
  { path: "/login", public: true },
  { path: "/select-role", public: true },
  { path: "/unauthorized", public: true },

  { path: "/dashboard", layout: true, roles: ALL_AUTHED },
  { path: "/goals", layout: true, roles: [ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER, ROLES.REVIEWING_OFFICER, ROLES.ACCEPTING_OFFICER] },
  { path: "/tracking", layout: true, roles: [ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER] },
  { path: "/reviews", layout: true, roles: [ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER, ROLES.REVIEWING_OFFICER, ROLES.ACCEPTING_OFFICER] },

  { path: "/admin-dashboard", layout: true, roles: [ROLES.HR_ADMIN] },
  { path: "/admin/cycles", layout: true, roles: [ROLES.HR_ADMIN] },
  { path: "/admin/cycles/:cycleId/participants", layout: true, roles: [ROLES.HR_ADMIN] },
  { path: "/admin/users", layout: true, roles: [ROLES.HR_ADMIN] },
  { path: "/admin/users/create", layout: true, roles: [ROLES.HR_ADMIN] },
  { path: "/admin/departments", layout: true, roles: [ROLES.HR_ADMIN] },
  { path: "/admin/analytics", layout: true, roles: [ROLES.HR_ADMIN] },
  { path: "/admin/audit", layout: true, roles: [ROLES.HR_ADMIN] },
  { path: "/admin/all-users", layout: true, roles: [ROLES.HR_ADMIN] },
  { path: "/admin/hierarchy", layout: true, roles: [ROLES.HR_ADMIN] },
  { path: "/admin/create-user", layout: true, roles: [ROLES.HR_ADMIN] },
]);

export const sidebarItems = Object.freeze([
  {
    key: "dashboard",
    to: (role) => roleHomePath(role),
    icon: LayoutDashboard,
    label: "Dashboard",
    roles: ALL_AUTHED,
  },
  {
    key: "goals",
    to: "/goals",
    icon: Target,
    label: "Goals",
    roles: [ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER, ROLES.REVIEWING_OFFICER, ROLES.ACCEPTING_OFFICER],
  },
  {
    key: "tracking",
    to: "/tracking",
    icon: BarChart2,
    label: "Six-Month Tracking",
    roles: [ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER],
  },
  {
    key: "reviews",
    to: "/reviews",
    icon: ClipboardList,
    label: "Year-End Reviews",
    roles: [ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER, ROLES.REVIEWING_OFFICER, ROLES.ACCEPTING_OFFICER],
  },
  {
    key: "admin",
    to: "/admin/cycles",
    icon: Users,
    label: "Administration",
    roles: [ROLES.HR_ADMIN],
  },
  {
    key: "admin-all-users",
    to: "/admin/all-users",
    icon: Users,
    label: "All Users",
    roles: [ROLES.HR_ADMIN],
  },
  {
    key: "admin-hierarchy",
    to: "/admin/hierarchy",
    icon: Network,
    label: "Reporting Hierarchy",
    roles: [ROLES.HR_ADMIN],
  },
]);

