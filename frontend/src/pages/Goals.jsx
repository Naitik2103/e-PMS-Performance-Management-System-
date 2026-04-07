import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import { ROLES } from "../constants/rbac";

const Goals = () => {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [form, setForm] = useState({ year: new Date().getFullYear(), goalTitle: "", goalDescription: "", weightage: "" });
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  const loadGoals = async () => {
    try {
      if (user?.role === ROLES.EMPLOYEE) {
        const response = await apiClient.get("/goals/my");
        setGoals(response.data);
      } else if (user?.role === ROLES.REPORTING_OFFICER) {
        const response = await apiClient.get("/goals/pending/ro");
        setGoals(response.data);
      } else if (user?.role === ROLES.REVIEWING_OFFICER) {
        const response = await apiClient.get("/goals/pending/review");
        setGoals(response.data);
      } else {
        const response = await apiClient.get("/goals/all");
        setGoals(response.data);
      }
    } catch (err) {
      setGoals([]);
    }
  };

  useEffect(() => {
    if (user) loadGoals();
  }, [user]);

  const cycleTotals = useMemo(() => {
    const map = new Map();
    goals.forEach((goal) => {
      const key = goal.cycleId || goal.cycle?.id || "unknown";
      map.set(key, Number(map.get(key) || 0) + Number(goal.weightage || 0));
    });
    return map;
  }, [goals]);

  const handleSave = async () => {
    setError("");
    try {
      const payload = {
        year: Number(form.year),
        goalTitle: form.goalTitle,
        goalDescription: form.goalDescription,
        weightage: Number(form.weightage)
      };
      if (editingId) {
        await apiClient.put(`/goals/goal/${editingId}`, payload);
      } else {
        await apiClient.post("/goals", payload);
      }
      setEditingId(null);
      setForm({ year: new Date().getFullYear(), goalTitle: "", goalDescription: "", weightage: "" });
      loadGoals();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save goal");
    }
  };

  const handleSubmitGoals = async (year) => {
    setError("");
    try {
      await apiClient.post("/goals/submit", { year });
      loadGoals();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to submit goals");
    }
  };

  const handleEdit = (goal) => {
    setEditingId(goal.id);
    setForm({
      year: goal.cycle?.year || new Date().getFullYear(),
      goalTitle: goal.goalTitle,
      goalDescription: goal.goalDescription || "",
      weightage: String(goal.weightage || "")
    });
  };

  const handleApprove = async (goalId, type, decision = "approve") => {
    try {
      await apiClient.post(`/goals/${goalId}/approve/${type}`, { decision });
      loadGoals();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to process goal action");
    }
  };

  return (
    <div className="page-content">
      {user?.role === ROLES.EMPLOYEE && (
        <div className="card">
          <div className="card-header">
            <h2>{editingId ? "Edit Goal" : "Create Goal"}</h2>
          </div>
          <div className="form-grid">
            <div className="form-row">
              <div>
                <label>Cycle Year</label>
                <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
              </div>
              <div>
                <label>Weightage</label>
                <input type="number" min={0} max={100} value={form.weightage} onChange={(e) => setForm({ ...form, weightage: e.target.value })} />
              </div>
            </div>
            <div>
              <label>Goal Title</label>
              <input value={form.goalTitle} onChange={(e) => setForm({ ...form, goalTitle: e.target.value })} />
            </div>
            <div>
              <label>Goal Description (KPI)</label>
              <textarea rows={4} value={form.goalDescription} onChange={(e) => setForm({ ...form, goalDescription: e.target.value })} />
            </div>
            {error && <div className="error-text">{error}</div>}
            <div className="action-row">
              <button className="btn" type="button" onClick={handleSave}>{editingId ? "Update" : "Save Draft"}</button>
              <button className="btn secondary" type="button" onClick={() => handleSubmitGoals(Number(form.year))}>Submit Cycle Goals</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Goals</h2>
          <span className="muted">{goals.length} record{goals.length !== 1 ? "s" : ""}</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Cycle</th>
              <th>Goal</th>
              <th>Weightage</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {goals.length === 0 && (
              <tr><td colSpan={6} className="table-empty">No goals found.</td></tr>
            )}
            {goals.map((goal) => (
              <tr key={goal.id}>
                <td>{goal.employee?.name || "Self"}</td>
                <td>{goal.cycle?.name || goal.cycle?.year || "-"}</td>
                <td>{goal.goalTitle}</td>
                <td>{Number(goal.weightage).toFixed(2)}</td>
                <td><StatusBadge status={goal.status} /></td>
                <td>
                  <div className="table-actions">
                    {user?.role === ROLES.EMPLOYEE && ["draft", "returned"].includes(goal.status) && (
                      <button className="btn ghost" type="button" onClick={() => handleEdit(goal)}>Edit</button>
                    )}
                    {user?.role === ROLES.REPORTING_OFFICER && (
                      <>
                        <button className="btn" type="button" onClick={() => handleApprove(goal.id, "ro", "approve")}>Approve</button>
                        <button className="btn ghost" type="button" onClick={() => handleApprove(goal.id, "ro", "return")}>Return</button>
                      </>
                    )}
                    {user?.role === ROLES.REVIEWING_OFFICER && (
                      <>
                        <button className="btn" type="button" onClick={() => handleApprove(goal.id, "review", "approve")}>Approve</button>
                        <button className="btn ghost" type="button" onClick={() => handleApprove(goal.id, "review", "return")}>Return</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {user?.role === ROLES.EMPLOYEE && (
          <div className="muted" style={{ paddingTop: 12 }}>
            Current cycle total weightage: {Array.from(cycleTotals.values())[0]?.toFixed?.(2) || "0.00"} / 100.00
          </div>
        )}
      </div>
    </div>
  );
};

export default Goals;
