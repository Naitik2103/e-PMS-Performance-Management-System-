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
        <div className="welcome-badge">{roleLabel(user?.role)}</div>
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
          navigation to access Goals, Tracking, and Reviews. Your role is <strong>{roleLabel(user?.role)}</strong>,
          which determines what actions you can take in the system.
        </p>
      </div>
    </div>
  );
};

export default Dashboard;
