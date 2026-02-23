import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";

const emptyKpa = { title: "", description: "", weight: 0, measures: "" };

const Goals = () => {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [form, setForm] = useState({ year: new Date().getFullYear(), kpas: [emptyKpa] });
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  const totalWeight = useMemo(() => form.kpas.reduce((sum, kpa) => sum + Number(kpa.weight || 0), 0), [form]);

  const loadGoals = async () => {
    try {
      if (user?.role === "Employee") {
        const response = await apiClient.get("/goals/my");
        setGoals(response.data);
      } 
      else if (user?.role === "ReportingOfficer") {
        const response = await apiClient.get("/goals/pending/ro");
        setGoals(response.data);
      } 
      else if (user?.role === "ReviewingOfficer") {
        const response = await apiClient.get("/goals/pending/review");
        setGoals(response.data);
      } 
      else {
        const response = await apiClient.get("/goals/all");
        setGoals(response.data);
      }
    } catch (err) {
      setGoals([]);
    }
  };

  useEffect(() => {
    if (user) {
      loadGoals();
    }
  }, [user]);

  const updateKpa = (index, field, value) => {
    const next = [...form.kpas];
    next[index] = { ...next[index], [field]: value };
    setForm({ ...form, kpas: next });
  };

  const addKpa = () => setForm({ ...form, kpas: [...form.kpas, emptyKpa] });

  const removeKpa = (index) => {
    const next = form.kpas.filter((_, idx) => idx !== index);
    setForm({ ...form, kpas: next.length ? next : [emptyKpa] });
  };

  const handleSave = async () => {
    setError("");
    try {
      if (editingId) {
        await apiClient.put(`/goals/${editingId}`, form);
      } 
      else {
        await apiClient.post("/goals", form);
      }
      setForm({ year: new Date().getFullYear(), kpas: [emptyKpa] });
      setEditingId(null);
      loadGoals();
    } 
    catch (err) {
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
    setEditingId(goal._id);
    setForm({ year: goal.year, kpas: goal.kpas });
  };

  const handleApprove = async (goalId, type) => {
    try {
      await apiClient.post(`/goals/${goalId}/approve/${type}`);
      loadGoals();
    } 
    catch (err) {
      setError(err.response?.data?.message || "Unable to approve goal");
    }
  };

  return (
    <div className="page-content">
      {user?.role === "Employee" && (
        <div className="card">
          <div className="card-header">
            <h2>{editingId ? "Edit Annual Goal" : "Create Annual Goal"}</h2>
            <span className="muted">Total Weight: {totalWeight}</span>
          </div>
          <div className="form-grid">
            <div>
              <label>Year</label>
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
              />
            </div>
            <div className="kpa-list">
              {form.kpas.map((kpa, index) => (
                <div className="kpa-item" key={`kpa-${index}`}>
                  <div className="form-row">
                    <div>
                      <label>KPA Title</label>
                      <input value={kpa.title} onChange={(e) => updateKpa(index, "title", e.target.value)} />
                    </div>
                    <div>
                      <label>Weight</label>
                      <input
                        type="number"
                        value={kpa.weight}
                        onChange={(e) => updateKpa(index, "weight", Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div>
                      <label>Description</label>
                      <input value={kpa.description} onChange={(e) => updateKpa(index, "description", e.target.value)} />
                    </div>
                    <div>
                      <label>Measures</label>
                      <input value={kpa.measures} onChange={(e) => updateKpa(index, "measures", e.target.value)} />
                    </div>
                  </div>
                  <button className="btn ghost" onClick={() => removeKpa(index)} type="button">
                    Remove
                  </button>
                </div>
              ))}
            </div>
            {error && <div className="error-text">{error}</div>}
            <div className="action-row">
              <button className="btn secondary" type="button" onClick={addKpa}>
                Add KPA
              </button>
              <button className="btn" type="button" onClick={handleSave}>
                {editingId ? "Update" : "Save Draft"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Goals</h2>
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
            {goals.map((goal) => (
              <tr key={goal._id}>
                <td>{goal.employee?.name || "Self"}</td>
                <td>{goal.year}</td>
                <td><StatusBadge status={goal.status} /></td>
                <td>{goal.totalWeight}</td>
                <td>
                  <div className="table-actions">
                  {user?.role === "Employee" && goal.status === "draft" && (
                    <>
                      <button className="btn ghost" type="button" onClick={() => handleEdit(goal)}>
                        Edit
                      </button>
                      <button className="btn" type="button" onClick={() => handleSubmitGoal(goal._id)}>
                        Submit
                      </button>
                    </>
                  )}
                  {user?.role === "ReportingOfficer" && (
                    <button className="btn" type="button" onClick={() => handleApprove(goal._id, "ro")}>
                      Approve
                    </button>
                  )}
                  {user?.role === "ReviewingOfficer" && (
                    <button className="btn" type="button" onClick={() => handleApprove(goal._id, "review")}>
                      Approve
                    </button>
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