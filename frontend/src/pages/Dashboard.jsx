import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";
import { Target, BarChart2, ClipboardList, TrendingUp, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ROLES, roleLabel } from "../constants/rbac";
import { getPeriodVisibility, formatDateDisplay, debugPeriodVisibility } from "../utils/periodVisibility";


const Dashboard = () => {
  const { user, activeCycle } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ goals: 0, tracking: 0, reviews: 0, status: "Active" });
  const [accessWindow, setAccessWindow] = useState(null);
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
  const [periodVisibility, setPeriodVisibility] = useState({
    goalSetting: { isActive: false },
    sixMonthReview: { isActive: false },
    annualAppraisal: { isActive: false }
  });

  useEffect(() => {
    if (activeCycle) {
      setPeriodVisibility(getPeriodVisibility(activeCycle));
      // Debug: Log period visibility information to console
      debugPeriodVisibility(activeCycle);
    }
  }, [activeCycle]);

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
    let alive = true;
    const loadAccess = async () => {
      if (user?.role !== ROLES.EMPLOYEE) {
        if (alive) setAccessWindow(null);
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

  const sixMonthState = accessWindow?.sixMonthState || "closed";
  const annualState = accessWindow?.annualState || "closed";

  const visibleStatCards = user?.role === ROLES.EMPLOYEE ? statCards : statCards;

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
        {visibleStatCards.map((card) => {
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
              {card.action && user?.role === ROLES.EMPLOYEE && (card.action === "/tracking" || card.action === "/reviews") ? (
                sixMonthState !== "open" && card.action === "/tracking" ? (
                  <div className="muted small" style={{ paddingTop: 10 }}>
                    {sixMonthState === "not_started"
                      ? "Six-month progress period has not started yet."
                      : sixMonthState === "closed"
                        ? "Six-month progress period is closed."
                        : "Six-month progress period is not available."}
                  </div>
                ) : annualState !== "open" && card.action === "/reviews" ? (
                  <div className="muted small" style={{ paddingTop: 10 }}>
                    {annualState === "not_started"
                      ? "Annual appraisal period has not started yet."
                      : annualState === "closed"
                        ? "Annual appraisal period is closed."
                        : "Annual appraisal period is not available."}
                  </div>
                ) : (
                  <button className="stat-card-action" onClick={() => navigate(card.action)}>
                    {card.actionLabel} <ArrowRight size={14} />
                  </button>
                )
              ) : (
                card.action && (
                  <button className="stat-card-action" onClick={() => navigate(card.action)}>
                    {card.actionLabel} <ArrowRight size={14} />
                  </button>
                )
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

      {/* Active Periods Card */}
      {activeCycle && (
        <div className="card dashboard-info-card">
          <div className="card-header">
            <h2>Active Appraisal Periods</h2>
            <span className="muted">{activeCycle.year} Cycle</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "16px" }}>
            {/* Goal Setting Period */}
            <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: periodVisibility.goalSetting.isActive ? "#eef2fb" : "#f5f5f5" }}>
              <div style={{ fontWeight: 500, color: periodVisibility.goalSetting.isActive ? "#2b5fbf" : "#666", marginBottom: "4px" }}>
                📋 Goal Setting
              </div>
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>
                {formatDateDisplay(periodVisibility.goalSetting.startDate)} - {formatDateDisplay(periodVisibility.goalSetting.endDate)}
              </div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: periodVisibility.goalSetting.isActive ? "#2b5fbf" : "#999" }}>
                {periodVisibility.goalSetting.isActive ? "🟢 ACTIVE NOW" : "Inactive"}
              </div>
            </div>

            {/* Six-Month Review Period */}
            <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: periodVisibility.sixMonthReview.isActive ? "#f0fdf4" : "#f5f5f5" }}>
              <div style={{ fontWeight: 500, color: periodVisibility.sixMonthReview.isActive ? "#0d9488" : "#666", marginBottom: "4px" }}>
                📊 Six-Month Review
              </div>
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>
                {formatDateDisplay(periodVisibility.sixMonthReview.startDate)} - {formatDateDisplay(periodVisibility.sixMonthReview.endDate)}
              </div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: periodVisibility.sixMonthReview.isActive ? "#0d9488" : "#999" }}>
                {periodVisibility.sixMonthReview.isActive ? "🟢 ACTIVE NOW" : "Inactive"}
              </div>
            </div>

            {/* Annual Appraisal Period */}
            <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: periodVisibility.annualAppraisal.isActive ? "#f5f3ff" : "#f5f5f5" }}>
              <div style={{ fontWeight: 500, color: periodVisibility.annualAppraisal.isActive ? "#7c3aed" : "#666", marginBottom: "4px" }}>
                ⭐ Annual Appraisal
              </div>
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>
                {formatDateDisplay(periodVisibility.annualAppraisal.startDate)} - {formatDateDisplay(periodVisibility.annualAppraisal.endDate)}
              </div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: periodVisibility.annualAppraisal.isActive ? "#7c3aed" : "#999" }}>
                {periodVisibility.annualAppraisal.isActive ? "🟢 ACTIVE NOW" : "Inactive"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
