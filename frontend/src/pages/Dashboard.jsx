import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";
import { Target, BarChart2, ClipboardList, TrendingUp, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ROLES, roleLabel } from "../constants/rbac";

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ goals: 0, tracking: 0, reviews: 0, status: "Active" });
  const [assigned, setAssigned] = useState({
    mode: ROLES.EMPLOYEE,
    officers: {
      reportingOfficer: null,
      reviewingOfficer: null,
      acceptingOfficer: null,
    },
    employees: [],
  });
  const [hasActiveCycle, setHasActiveCycle] = useState(false);

  useEffect(() => {
    const loadStats = async () => {
      try {
        if (user?.role === ROLES.EMPLOYEE) {
          const [goals, tracking, reviews] = await Promise.all([
            apiClient.get("/goals/my"),
            apiClient.get("/tracking/my"),
            apiClient.get("/reviews/my"),
          ]);
          setStats({ goals: goals.data.length, tracking: tracking.data.length, reviews: reviews.data.length, status: "Active" });
        } else if (user?.role === ROLES.REPORTING_OFFICER) {
          const [goals, tracking, reviews] = await Promise.all([
            apiClient.get("/goals/pending/ro"),
            apiClient.get("/tracking/team"),
            apiClient.get("/reviews/queue"),
          ]);
          setStats({ goals: goals.data.length, tracking: tracking.data.length, reviews: reviews.data.length, status: "Active" });
        } else {
          const [goals, reviews] = await Promise.all([
            apiClient.get("/goals/all"),
            apiClient.get("/reviews/queue"),
          ]);
          setStats({ goals: goals.data.length, tracking: 0, reviews: reviews.data.length, status: "Active" });
        }
      } catch (error) {
        setStats({ goals: 0, tracking: 0, reviews: 0, status: "Active" });
      }
    };
    if (user) loadStats();
  }, [user]);

  useEffect(() => {
    const loadAssignedEmployees = async () => {
      try {
        const res = await apiClient.get("/auth/my-assigned-employees");
        setAssigned({
          mode: res.data?.mode || (user?.selectedRole || user?.role || ROLES.EMPLOYEE),
          officers: res.data?.officers || {
            reportingOfficer: null,
            reviewingOfficer: null,
            acceptingOfficer: null,
          },
          employees: Array.isArray(res.data?.employees) ? res.data.employees : [],
        });
        setHasActiveCycle(Boolean(res.data?.cycleId));
      } catch {
        setAssigned({
          mode: user?.selectedRole || user?.role || ROLES.EMPLOYEE,
          officers: {
            reportingOfficer: null,
            reviewingOfficer: null,
            acceptingOfficer: null,
          },
          employees: [],
        });
        setHasActiveCycle(false);
      }
    };

    if (user) loadAssignedEmployees();
  }, [user]);

  const activeRole = user?.selectedRole || user?.role;
  const dutyTitleByRole = {
    [ROLES.REPORTING_OFFICER]: "Employees that Report",
    [ROLES.REVIEWING_OFFICER]: "Employees to Review",
    [ROLES.ACCEPTING_OFFICER]: "Employees to Accept",
  };

  const statCards = [
    {
      icon: Target,
      label: "Total Goals",
      value: stats.goals,
      color: "#2b5fbf",
      bg: "#eef2fb",
      action: "/goals",
      actionLabel: "View Goals",
    },
    {
      icon: BarChart2,
      label: "Tracking Records",
      value: stats.tracking,
      color: "#0d9488",
      bg: "#f0fdf4",
      action: "/tracking",
      actionLabel: "View Tracking",
    },
    {
      icon: ClipboardList,
      label: "Reviews in Pipeline",
      value: stats.reviews,
      color: "#7c3aed",
      bg: "#f5f3ff",
      action: "/reviews",
      actionLabel: "View Reviews",
    },
    {
      icon: TrendingUp,
      label: "Performance Status",
      value: stats.status,
      color: "#c05621",
      bg: "#fff7ed",
      action: null,
      actionLabel: null,
    },
  ];

  return (
    <div className="dashboard-page">
      {/* Welcome Banner */}
      <div className="dashboard-welcome">
        <div>
          <h2 className="welcome-title">Welcome back, {user?.name?.split(" ")[0]} 👋</h2>
          <p className="welcome-sub">Here is an overview of your performance management activity.</p>
        </div>
        <div className="welcome-badge">{roleLabel(activeRole)}</div>
      </div>

      {/* Stat Cards */}
      <div className="stat-cards-grid">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div className="stat-card" key={card.label}>
              <div className="stat-card-top">
                <div className="stat-card-icon" style={{ background: card.bg, color: card.color }}>
                  <Icon size={22} />
                </div>
                <div className="stat-card-meta">
                  <div className="stat-card-label">{card.label}</div>
                  <div className="stat-card-value" style={{ color: card.color }}>{card.value}</div>
                </div>
              </div>
              {card.action && (
                <button
                  className="stat-card-action"
                  onClick={() => navigate(card.action)}
                >
                  {card.actionLabel} <ArrowRight size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Info Card */}
      <div className="card dashboard-info-card">
        <div className="card-header">
          <h2>About Your Dashboard</h2>
        </div>
        <p style={{ color: "var(--grey-600)", lineHeight: 1.7 }}>
          This dashboard shows a summary of your performance management activity. Use the sidebar
          navigation to access Goals, Tracking, and Reviews. Your role is <strong>{roleLabel(activeRole)}</strong>,
          which determines what actions you can take in the system.
        </p>
      </div>

      <div className="card dashboard-info-card">
        <div className="card-header">
          <h2>
            {assigned.mode === ROLES.EMPLOYEE ? "My Appraisal Officers (Active Cycle)" : "Assigned Employees (Active Cycle)"}
          </h2>
        </div>
        {!hasActiveCycle ? (
          <p className="assignment-empty-message">
            No active appraisal cycle is available.
          </p>
        ) : assigned.mode === ROLES.EMPLOYEE ? (
          <div className="assignment-role-grid">
            {[
              { key: "ro", title: "Reporting Officer", item: assigned.officers?.reportingOfficer },
              { key: "revo", title: "Reviewing Officer", item: assigned.officers?.reviewingOfficer },
              { key: "ao", title: "Accepting Officer", item: assigned.officers?.acceptingOfficer },
            ].map((section) => (
              <div className="assignment-role-card" key={section.key}>
                <div className="assignment-role-top">
                  <div className="assignment-role-label">{section.title}</div>
                  <span className={`assignment-status-chip${section.item ? "" : " is-empty"}`}>
                    {section.item ? "Assigned" : "Pending"}
                  </span>
                </div>
                <div className="assignment-role-name">
                  {section.item?.name || "Not assigned"}
                </div>
                <div className="assignment-role-subtext">
                  {section.item ? "Assigned in current cycle" : "HR/Admin can assign this role from cycle participants"}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="assignment-employee-panel">
            <div className="assignment-employee-head">
              <div>
                <div className="assignment-employee-title">{dutyTitleByRole[assigned.mode] || "Assigned Employees"}</div>
                <div className="assignment-employee-subtitle">Only employees mapped to your current role context are shown here.</div>
              </div>
              <div className="assignment-count-pill">{assigned.employees.length}</div>
            </div>
            {assigned.employees.length === 0 ? (
              <div className="assignment-empty-message">No employees assigned.</div>
            ) : (
              <div className="assignment-employee-list">
                {assigned.employees.slice(0, 12).map((emp) => (
                  <div key={emp.employeeId} className="assignment-employee-item">
                    <div className="assignment-employee-avatar">{String(emp.employeeName || "?").trim().charAt(0).toUpperCase()}</div>
                    <div className="assignment-employee-meta">
                      <div className="assignment-employee-name">
                        {emp.employeeName}
                        {emp.employeeCode ? ` (${emp.employeeCode})` : ""}
                      </div>
                      <div className="assignment-employee-details">
                        {emp.department || "Department not set"}
                        {emp.designation ? ` • ${emp.designation}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
                {assigned.employees.length > 12 && (
                  <div className="assignment-more-note">+{assigned.employees.length - 12} more</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
