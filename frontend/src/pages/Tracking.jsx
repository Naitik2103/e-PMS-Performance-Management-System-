import React, { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../constants/rbac";
import { isSixMonthReviewPeriodActive, formatDateDisplay } from "../utils/periodVisibility";

const Tracking = () => {
  const { user, activeCycle } = useAuth();
  const [tracking, setTracking] = useState([]);
  const [goals, setGoals] = useState([]);
  const [form, setForm] = useState({ goalId: "", cycleId: "", progressText: "" });
  const [error, setError] = useState("");
  const [remarks, setRemarks] = useState({});
  const [isSixMonthPeriodActive, setIsSixMonthPeriodActive] = useState(false);

  useEffect(() => {
    setIsSixMonthPeriodActive(isSixMonthReviewPeriodActive(activeCycle));
  }, [activeCycle]);

  const activeCycleId = activeCycle?.cycleId || activeCycle?.id || null;
  const submittedGoalIds = new Set(
    tracking
      .filter((item) => item.status === "submitted" && (!activeCycleId || item.cycleId === activeCycleId))
      .map((item) => item.goalId)
  );
  const availableGoals = goals.filter((goal) => !submittedGoalIds.has(goal.id));

  const loadData = async () => {
    try {
      if (user?.role === ROLES.EMPLOYEE) {
        const [trackingRes, goalsRes] = await Promise.all([apiClient.get("/tracking/my"), apiClient.get("/goals/my")]);
        setTracking(trackingRes.data);
        setGoals(goalsRes.data);
        if (!form.goalId && goalsRes.data.length) {
          setForm((prev) => ({ ...prev, goalId: goalsRes.data[0].id, cycleId: goalsRes.data[0].cycleId || goalsRes.data[0].cycle?.id || "" }));
        }
      }
      if (user?.role === ROLES.REPORTING_OFFICER) {
        const trackingRes = await apiClient.get("/tracking/team");
        setTracking(trackingRes.data);
      }
    } catch (err) {
      setTracking([]);
    }
  };

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  useEffect(() => {
    if (user?.role !== ROLES.EMPLOYEE) return;

    if (!availableGoals.length) {
      setForm((prev) => ({ ...prev, goalId: "", cycleId: "" }));
      return;
    }

    const selectedStillAvailable = availableGoals.some((goal) => goal.id === form.goalId);
    if (!selectedStillAvailable) {
      const firstGoal = availableGoals[0];
      setForm((prev) => ({
        ...prev,
        goalId: firstGoal.id,
        cycleId: firstGoal.cycleId || firstGoal.cycle?.id || ""
      }));
    }
  }, [availableGoals, form.goalId, user?.role]);

  const handleSave = async () => {
    setError("");
    try {
      await apiClient.post("/tracking", form);
      setForm((prev) => ({ ...prev, progressText: "" }));
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save tracking update");
    }
  };

  const handleSubmitAll = async () => {
    setError("");
    try {
      const activeCycleId = activeCycle?.cycleId || activeCycle?.id;
      await apiClient.post("/tracking/submit", { cycleId: activeCycleId });
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to submit tracking");
    }
  };

  const submitRemarks = async (trackingId) => {
    try {
      await apiClient.post("/tracking/remarks", { trackingId, reportingRemarks: remarks[trackingId] });
      setRemarks((prev) => ({ ...prev, [trackingId]: "" }));
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to submit remarks");
    }
  };

  return (
    <div className="page-content">
      {user?.role === ROLES.EMPLOYEE && !isSixMonthPeriodActive && (
        <div className="card" style={{ borderLeft: "4px solid #ff9800" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ fontSize: "24px" }}>⏰</div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>Six-Month Review Period Not Active</div>
              <div style={{ color: "#666", fontSize: "14px" }}>
                You can submit tracking updates only during the six-month review period.
                {activeCycle?.sixMonthProgressReviewStart && (
                  <>
                    <br />
                    <strong>Period:</strong> {formatDateDisplay(activeCycle.sixMonthProgressReviewStart)} to {formatDateDisplay(activeCycle.sixMonthProgressReviewEnd)}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {user?.role === ROLES.EMPLOYEE && isSixMonthPeriodActive && availableGoals.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>Submit Six-Month Tracking</h2>
          </div>
          <div className="form-grid">
            <div>
              <label>Goal</label>
              <select
                value={form.goalId}
                onChange={(e) => {
                  const goal = goals.find((g) => g.id === e.target.value);
                  setForm({ ...form, goalId: e.target.value, cycleId: goal?.cycleId || goal?.cycle?.id || "" });
                }}
              >
                <option value="">Select a goal...</option>
                {availableGoals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.goalTitle} ({Number(goal.weightage).toFixed(2)}%)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Progress Text</label>
              <textarea rows={5} value={form.progressText} onChange={(e) => setForm({ ...form, progressText: e.target.value })} />
            </div>
            {error && <div className="error-text">{error}</div>}
            <div className="action-row">
              <button className="btn" type="button" onClick={handleSave}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {user?.role === ROLES.EMPLOYEE && isSixMonthPeriodActive && availableGoals.length === 0 && tracking.length > 0 && (
        <div className="card" style={{ borderLeft: "4px solid #4caf50" }}>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>Self summary already submitted</div>
          <div style={{ color: "#666", fontSize: "14px" }}>
            You have already submitted six-month tracking for all available goals. You can view the submitted records below.
          </div>
        </div>
      )}

      {user?.role === ROLES.EMPLOYEE && isSixMonthPeriodActive && tracking.some(t => t.status === "draft") && (
        <div className="card">
          <div className="card-header">
            <h2>Submit for Review</h2>
          </div>
          <p style={{ marginBottom: "16px", color: "#666" }}>
            You have saved {tracking.filter(t => t.status === "draft").length} goal progress update(s). Click below to submit all for your reporting officer's review.
          </p>
          <button className="btn btn-primary" type="button" onClick={handleSubmitAll}>
            Submit Self Summary
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Tracking Records</h2>
          <span className="muted">{tracking.length} record{tracking.length !== 1 ? "s" : ""}</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Goal</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Reporting Remarks</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tracking.length === 0 && <tr><td colSpan={6} className="table-empty">No tracking records found.</td></tr>}
            {tracking.map((record) => (
              <tr key={record.id}>
                <td>{record.employee?.name || "Self"}</td>
                <td>{record.goalTitle || "N/A"}</td>
                <td>
                  <span style={{
                    padding: "4px 8px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontWeight: "600",
                    backgroundColor: record.status === "submitted" ? "#d4edda" : "#fff3cd",
                    color: record.status === "submitted" ? "#155724" : "#856404"
                  }}>
                    {record.status === "submitted" ? "Submitted" : "Draft"}
                  </span>
                </td>
                <td>{record.progressText}</td>
                <td>{record.reportingRemarks || <span className="muted">-</span>}</td>
                <td>
                  {user?.role === ROLES.REPORTING_OFFICER && record.status === "submitted" && (
                    <div className="inline-form-short">
                      <input
                        placeholder="Add remarks..."
                        value={remarks[record.id] || ""}
                        onChange={(e) => setRemarks((prev) => ({ ...prev, [record.id]: e.target.value }))}
                      />
                      <button className="btn" type="button" onClick={() => submitRemarks(record.id)}>Submit</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Tracking;
