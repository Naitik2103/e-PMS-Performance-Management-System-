import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import { Plus, Trash2, CheckCircle, AlertCircle } from "lucide-react";

const emptyKpa = { title: "", description: "", weight: 0, measures: "" };

const Goals = () => {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [form, setForm] = useState({ year: new Date().getFullYear(), kpas: [emptyKpa] });
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  const totalWeight = useMemo(
    () => form.kpas.reduce((sum, kpa) => sum + Number(kpa.weight || 0), 0),
    [form]
  );
  const weightOk = totalWeight === 100;

  const loadGoals = async () => {
    try {
      if (user?.role === "Employee") {
        const response = await apiClient.get("/goals/my");
        setGoals(response.data);
      } else if (user?.role === "ReportingOfficer") {
        const response = await apiClient.get("/goals/pending/ro");
        setGoals(response.data);
      } else if (user?.role === "ReviewingOfficer") {
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

  const updateKpa = (index, field, value) => {
    const next = [...form.kpas];
    next[index] = { ...next[index], [field]: value };
    setForm({ ...form, kpas: next });
  };

  const addKpa = () => setForm({ ...form, kpas: [...form.kpas, { ...emptyKpa }] });

  const removeKpa = (index) => {
    const next = form.kpas.filter((_, idx) => idx !== index);
    setForm({ ...form, kpas: next.length ? next : [{ ...emptyKpa }] });
  };

  const handleSave = async () => {
    setError("");
    if (!weightOk) {
      setError(`Total KPA weight must equal 100. Currently: ${totalWeight}`);
      return;
    }
    try {
      if (editingId) {
        await apiClient.put(`/goals/${editingId}`, form);
      } else {
        await apiClient.post("/goals", form);
      }
      setForm({ year: new Date().getFullYear(), kpas: [{ ...emptyKpa }] });
      setEditingId(null);
      loadGoals();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save goal");
    }
  };

  const handleSubmitGoal = async (goalId) => {
    try {
      await apiClient.post(`/goals/${goalId}/submit`);
      loadGoals();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to submit goal");
    }
  };

  const handleEdit = (goal) => {
    setEditingId(goal.id);
    setForm({ year: goal.year, kpas: goal.kpas });
  };

  const handleApprove = async (goalId, type) => {
    try {
      await apiClient.post(`/goals/${goalId}/approve/${type}`);
      loadGoals();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to approve goal");
    }
  };

  return (
    <div className="page-content">
      {user?.role === "Employee" && (
        <div className="card">
          <div className="card-header">
            <h2>{editingId ? "Edit Annual Goal" : "Create Annual Goal"}</h2>
          </div>

          {/* Weight Progress Bar */}
          <div className="weight-progress-wrap">
            <div className="weight-progress-bar-bg">
              <div
                className="weight-progress-bar-fill"
                style={{
                  width: `${Math.min(totalWeight, 100)}%`,
                  background: weightOk ? "#22c55e" : totalWeight > 100 ? "#ef4444" : "#2b5fbf",
                }}
              />
            </div>
            <div className={`weight-progress-label ${weightOk ? "weight-ok" : "weight-err"}`}>
              {weightOk ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
              <span>Total Weight: {totalWeight} / 100</span>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-row">
              <div>
                <label>Year</label>
                <input
                  type="number"
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="kpa-list">
              {form.kpas.map((kpa, index) => (
                <div className="kpa-item" key={`kpa-${index}`}>
                  <div className="kpa-item-header">
                    <span className="kpa-item-num">KPA {index + 1}</span>
                    <button className="btn-icon-danger" onClick={() => removeKpa(index)} type="button" title="Remove">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="form-row">
                    <div>
                      <label>KPA Title</label>
                      <input value={kpa.title} onChange={(e) => updateKpa(index, "title", e.target.value)} placeholder="e.g. Research Output" />
                    </div>
                    <div>
                      <label>Weight (out of 100)</label>
                      <input
                        type="number"
                        value={kpa.weight}
                        onChange={(e) => updateKpa(index, "weight", Number(e.target.value))}
                        min={0}
                        max={100}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div>
                      <label>Description</label>
                      <input value={kpa.description} onChange={(e) => updateKpa(index, "description", e.target.value)} placeholder="Describe the KPA" />
                    </div>
                    <div>
                      <label>Measures / Targets</label>
                      <input value={kpa.measures} onChange={(e) => updateKpa(index, "measures", e.target.value)} placeholder="How will this be measured?" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {error && <div className="error-text">{error}</div>}
            <div className="action-row">
              <button className="btn secondary" type="button" onClick={addKpa}>
                <Plus size={15} /> Add KPA
              </button>
              <button className="btn" type="button" onClick={handleSave} disabled={!weightOk}>
                {editingId ? "Update Goal" : "Save Draft"}
              </button>
              {editingId && (
                <button className="btn ghost" type="button" onClick={() => { setEditingId(null); setForm({ year: new Date().getFullYear(), kpas: [{ ...emptyKpa }] }); }}>
                  Cancel
                </button>
              )}
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
              <th>Year</th>
              <th>Status</th>
              <th>Total Weight</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {goals.length === 0 && (
              <tr><td colSpan={5} className="table-empty">No goals found.</td></tr>
            )}
            {goals.map((goal) => (
              <tr key={goal.id}>
                <td>{goal.employee?.name || "Self"}</td>
                <td>{goal.year}</td>
                <td><StatusBadge status={goal.status} /></td>
                <td>
                  <span className={goal.totalWeight === 100 ? "weight-chip-ok" : "weight-chip-err"}>
                    {goal.totalWeight}
                  </span>
                </td>
                <td>
                  <div className="table-actions">
                    {user?.role === "Employee" && goal.status === "draft" && (
                      <>
                        <button className="btn ghost" type="button" onClick={() => handleEdit(goal)}>Edit</button>
                        <button className="btn" type="button" onClick={() => handleSubmitGoal(goal.id)}>Submit</button>
                      </>
                    )}
                    {user?.role === "ReportingOfficer" && (
                      <button className="btn" type="button" onClick={() => handleApprove(goal.id, "ro")}>Approve</button>
                    )}
                    {user?.role === "ReviewingOfficer" && (
                      <button className="btn" type="button" onClick={() => handleApprove(goal.id, "review")}>Approve</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Goals;
