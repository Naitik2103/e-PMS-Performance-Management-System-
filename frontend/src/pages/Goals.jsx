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

  // Get the total of all draft and returned goals (unsubmitted goals)
  const draftGoalsTotal = useMemo(() => {
    return goals
      .filter((g) => ["draft", "returned"].includes(g.status))
      .reduce((sum, g) => sum + Number(g.weightage || 0), 0);
  }, [goals]);

  // Check if there are any unsubmitted goals
  const hasUnsubmittedGoals = useMemo(() => {
    return goals.some((g) => ["draft", "returned"].includes(g.status));
  }, [goals]);

  const isWeightageComplete = Math.abs(draftGoalsTotal - 100) < 0.01; // Allow for floating point errors
  const progressPercentage = Math.min((draftGoalsTotal / 100) * 100, 100);

  const handleSave = async () => {
    setError("");
    const weightage = Number(form.weightage);
    if (Number.isFinite(weightage) && weightage > 100) {
      setError("Weightage must be less than or equal to 100");
      return;
    }
    try {
      const payload = {
        year: Number(form.year),
        goalTitle: form.goalTitle,
        goalDescription: form.goalDescription,
        weightage
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
      setError(err.response?.data?.error || err.response?.data?.message || "Unable to save goal");
    }
  };

  const handleSubmitGoals = async (year) => {
    setError("");
    try {
      await apiClient.post("/goals/submit", { year });
      loadGoals();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Unable to submit goals");
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

  const handleDelete = async (goalId) => {
    if (!window.confirm("Are you sure you want to delete this goal? This action cannot be undone.")) {
      return;
    }
    setError("");
    try {
      await apiClient.delete(`/goals/${goalId}`);
      loadGoals();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Unable to delete goal");
    }
  };

  const handleApprove = async (goalId, type, decision = "approve") => {
    try {
      await apiClient.post(`/goals/${goalId}/approve/${type}`, { decision });
      loadGoals();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Unable to process goal action");
    }
  };

  return (
    <div className="page-content">
      {user?.role === ROLES.EMPLOYEE && (goals.length === 0 || hasUnsubmittedGoals) && (
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
                <input type="number" min={0} max={100} step="0.01" value={form.weightage} onChange={(e) => setForm({ ...form, weightage: e.target.value })} />
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
                      <>
                        <button className="btn ghost" type="button" onClick={() => handleEdit(goal)}>Edit</button>
                        <button className="btn ghost" type="button" style={{ color: "#f44336" }} onClick={() => handleDelete(goal.id)}>Remove</button>
                      </>
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
        {user?.role === ROLES.EMPLOYEE && hasUnsubmittedGoals && (
          <div style={{ paddingTop: 20, borderTop: "1px solid #e0e0e0" }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span className="muted">Goal Weightage Progress</span>
                <span style={{ fontWeight: 600, color: isWeightageComplete ? "#4CAF50" : "#f44336" }}>
                  {draftGoalsTotal.toFixed(2)} / 100.00
                </span>
              </div>
              <div style={{
                width: "100%",
                height: 8,
                backgroundColor: "#f0f0f0",
                borderRadius: 4,
                overflow: "hidden"
              }}>
                <div style={{
                  width: `${progressPercentage}%`,
                  height: "100%",
                  backgroundColor: isWeightageComplete ? "#4CAF50" : "#2196F3",
                  transition: "width 0.3s ease"
                }} />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
              <div>
                {!isWeightageComplete && (
                  <div className="error-text" style={{ fontSize: "0.9em", margin: 0 }}>
                    Total must equal 100.00 to submit (currently {draftGoalsTotal.toFixed(2)})
                  </div>
                )}
                {isWeightageComplete && (
                  <div style={{ color: "#4CAF50", fontSize: "0.9em", margin: 0, fontWeight: 500 }}>
                    ✓ All goals ready to submit
                  </div>
                )}
              </div>
              <button
                className="btn"
                type="button"
                disabled={!isWeightageComplete}
                onClick={() => handleSubmitGoals(Number(form.year))}
                title={isWeightageComplete ? "Submit all goals" : "Total weightage must equal 100.00 to submit"}
              >
                Submit Cycle Goals
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Goals;
