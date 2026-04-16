import React, { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../constants/rbac";

const Tracking = () => {
  const { user } = useAuth();
  const [tracking, setTracking] = useState([]);
  const [goals, setGoals] = useState([]);
  const [form, setForm] = useState({ goalId: "", cycleId: "", progressText: "" });
  const [error, setError] = useState("");
  const [remarks, setRemarks] = useState({});
  const [accessWindow, setAccessWindow] = useState(null);

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
    let alive = true;
    const loadAccess = async () => {
      if (user?.role !== ROLES.EMPLOYEE) return;
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

  const sixMonthState = user?.role === ROLES.EMPLOYEE ? accessWindow?.sixMonthState || "closed" : "open";
  const sixMonthOpen = sixMonthState === "open";

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
      {user?.role === ROLES.EMPLOYEE && (
        <div className="card">
          <div className="card-header">
            <h2>Submit Six-Month Tracking</h2>
          </div>
          {!sixMonthOpen && (
            <div className="muted" style={{ marginBottom: 12 }}>
              {sixMonthState === "not_started"
                ? "Six-month progress period has not started yet."
                : sixMonthState === "closed"
                  ? "Six-month progress period is closed."
                  : "Six-month progress period is not available."}{" "}
              You can still view existing tracking records.
            </div>
          )}
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
                {goals.map((goal) => (
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
              <button className="btn" type="button" onClick={handleSave} disabled={!sixMonthOpen}>
                Submit Self Summary
              </button>
            </div>
          </div>
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
              <th>Period</th>
              <th>Progress</th>
              <th>Reporting Remarks</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tracking.length === 0 && <tr><td colSpan={5} className="table-empty">No tracking records found.</td></tr>}
            {tracking.map((record) => (
              <tr key={record.id}>
                <td>{record.employee?.name || "Self"}</td>
                <td>{record.period}</td>
                <td>{record.progressText}</td>
                <td>{record.reportingRemarks || <span className="muted">-</span>}</td>
                <td>
                  {user?.role === ROLES.REPORTING_OFFICER && (
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
