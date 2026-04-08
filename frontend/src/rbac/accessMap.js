import {
  LayoutDashboard,
  Target,
  BarChart2,
  ClipboardList,
  Users,
  UserPlus,
  CalendarDays,
  Network,
} from "lucide-react";

import { ROLES } from "../constants/rbac";

const ALL_AUTHED = Object.freeze([
  ROLES.EMPLOYEE,
  ROLES.REPORTING_OFFICER,
  ROLES.REVIEWING_OFFICER,
  ROLES.ACCEPTING_OFFICER,
  ROLES.HR_ADMIN,
]);

export const roleHomePath = (role) => (role === ROLES.HR_ADMIN ? "/admin-dashboard" : "/dashboard");

export const appRoutes = Object.freeze([
  { path: "/", public: true },
  { path: "/login", public: true },
  { path: "/select-role", public: true },
  { path: "/unauthorized", public: true },

  { path: "/dashboard", layout: true, roles: ALL_AUTHED },
  { path: "/goals", layout: true, roles: [ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER, ROLES.REVIEWING_OFFICER] },
  { path: "/tracking", layout: true, roles: [ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER] },
  { path: "/reviews", layout: true, roles: [ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER, ROLES.REVIEWING_OFFICER, ROLES.ACCEPTING_OFFICER] },

  { path: "/admin-dashboard", layout: true, roles: [ROLES.HR_ADMIN] },
  { path: "/admin/create-user", layout: true, roles: [ROLES.HR_ADMIN] },
  { path: "/admin/cycles", layout: true, roles: [ROLES.HR_ADMIN] },
  { path: "/admin/all-users", layout: true, roles: [ROLES.HR_ADMIN] },
  { path: "/admin/hierarchy", layout: true, roles: [ROLES.HR_ADMIN] },
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
    roles: [ROLES.EMPLOYEE, ROLES.REPORTING_OFFICER, ROLES.REVIEWING_OFFICER],
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
    to: "/admin-dashboard",
    icon: Users,
    label: "Admin Panel",
    roles: [ROLES.HR_ADMIN],
  },
  {
    key: "admin-create-user",
    to: "/admin/create-user",
    icon: UserPlus,
    label: "Create New User",
    roles: [ROLES.HR_ADMIN],
  },
  {
    key: "admin-cycles",
    to: "/admin/cycles",
    icon: CalendarDays,
    label: "Appraisal Cycle Management",
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

