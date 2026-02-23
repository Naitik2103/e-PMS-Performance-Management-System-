import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({ goals: 0, tracking: 0, reviews: 0 });

  useEffect(() => {
    const loadStats = async () => {
      try {
        if (user?.role === "Employee") {
          const [goals, tracking, reviews] = await Promise.all([
            apiClient.get("/goals/my"),
            apiClient.get("/tracking/my"),
            apiClient.get("/reviews/my")
          ]);
          setStats({ goals: goals.data.length, tracking: tracking.data.length, reviews: reviews.data.length });
        } else if (user?.role === "ReportingOfficer") {
          const [goals, tracking, reviews] = await Promise.all([
            apiClient.get("/goals/pending/ro"),
            apiClient.get("/tracking/team"),
            apiClient.get("/reviews/queue")
          ]);
          setStats({ goals: goals.data.length, tracking: tracking.data.length, reviews: reviews.data.length });
        } else {
          const [goals, reviews] = await Promise.all([
            apiClient.get("/goals/all"),
            apiClient.get("/reviews/queue")
          ]);
          setStats({ goals: goals.data.length, tracking: 0, reviews: reviews.data.length });
        }
      } catch (error) {
        setStats({ goals: 0, tracking: 0, reviews: 0 });
      }
    };

    if (user) {
      loadStats();
    }
  }, [user]);

  return (
    <div className="grid-two">
      <div className="card">
        <div className="card-header">
          <h2>Goals Overview</h2>
        </div>
        <p>Total goals in your scope: <strong>{stats.goals}</strong></p>
      </div>
      <div className="card">
        <div className="card-header">
          <h2>Tracking Updates</h2>
        </div>
        <p>Tracking items needing attention: <strong>{stats.tracking}</strong></p>
      </div>
      <div className="card">
        <div className="card-header">
          <h2>Year-End Reviews</h2>
        </div>
        <p>Reviews in pipeline: <strong>{stats.reviews}</strong></p>
      </div>
      <div className="card">
        <div className="card-header">
          <h2>Welcome</h2>
        </div>
        <p>Hi {user?.name}, manage your performance workflows with real-time status updates and approvals.</p>
      </div>
    </div>
  );
};

export default Dashboard;
