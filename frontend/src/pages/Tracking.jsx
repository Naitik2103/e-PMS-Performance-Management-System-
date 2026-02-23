import React, { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";

const Tracking = () => {
  const { user } = useAuth();
  const [tracking, setTracking] = useState([]);
  const [goals, setGoals] = useState([]);
  const [form, setForm] = useState({ goalId: "", year: new Date().getFullYear(), period: "H1", progressEntries: [] });
  const [error, setError] = useState("");
  const [remarks, setRemarks] = useState({});

  const loadData = async () => {
    try {
      if (user?.role === "Employee") {
        const [trackingRes, goalsRes] = await Promise.all([
          apiClient.get("/tracking/my"),
          apiClient.get("/goals/my")
        ]);
        setTracking(trackingRes.data);
        setGoals(goalsRes.data);
        if (!form.goalId && goalsRes.data.length) {
          setForm((prev) => ({ ...prev, goalId: goalsRes.data[0]._id }));
        }
      }
      if (user?.role === "ReportingOfficer") {
        const trackingRes = await apiClient.get("/tracking/team");
        setTracking(trackingRes.data);
      }
    } catch (err) {
      setTracking([]);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const addEntry = () => {
    setForm((prev) => ({
      ...prev,
      progressEntries: [...prev.progressEntries, { kpaTitle: "", progress: "" }]
    }));
  };

  const updateEntry = (index, field, value) => {
    const next = [...form.progressEntries];
    next[index] = { ...next[index], [field]: value };
    setForm({ ...form, progressEntries: next });
  };

  const removeEntry = (index) => {
    const next = form.progressEntries.filter((_, idx) => idx !== index);
    setForm({ ...form, progressEntries: next });
  };

  const handleSave = async () => {
    setError("");
    try {
      await apiClient.post("/tracking", form);
      setForm({ goalId: form.goalId, year: new Date().getFullYear(), period: "H1", progressEntries: [] });
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save tracking update");
    }
  };

  const submitRemarks = async (trackingId) => {
    try {
      await apiClient.post("/tracking/remarks", { trackingId, roRemarks: remarks[trackingId] });
      setRemarks((prev) => ({ ...prev, [trackingId]: "" }));
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to submit remarks");
    }
  };

  return (
    <div className="page-content">
      {user?.role === "Employee" && (
        <div className="card">
          <div className="card-header">
            <h2>Update Six-Month Tracking</h2>
          </div>
          <div className="form-grid">
            <div className="form-row">
              <div>
                <label>Goal</label>
                <select value={form.goalId} onChange={(e) => setForm({ ...form, goalId: e.target.value })}>
                  {goals.map((goal) => (
                    <option key={goal._id} value={goal._id}>
                      {goal.year} - {goal.status}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Year</label>
                <input
                  type="number"
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
                />
              </div>
              <div>
                <label>Period</label>
                <select value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
                  <option value="H1">H1</option>
                  <option value="H2">H2</option>
                </select>
              </div>
            </div>

            <div className="kpa-list">
              {form.progressEntries.map((entry, index) => (
                <div className="kpa-item" key={`entry-${index}`}>
                  <div className="form-row">
                    <div>
                      <label>KPA Title</label>
                      <input value={entry.kpaTitle} onChange={(e) => updateEntry(index, "kpaTitle", e.target.value)} />
                    </div>
                    <div>
                      <label>Progress</label>
                      <input value={entry.progress} onChange={(e) => updateEntry(index, "progress", e.target.value)} />
                    </div>
                  </div>
                  <button className="btn ghost" type="button" onClick={() => removeEntry(index)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="action-row">
              <button className="btn secondary" type="button" onClick={addEntry}>
                Add Progress Entry
              </button>
              <button className="btn" type="button" onClick={handleSave}>
                Save Progress
              </button>
            </div>
            {error && <div className="error-text">{error}</div>}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Tracking Records</h2>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Year</th>
              <th>Period</th>
              <th>Status</th>
              <th>Remarks</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tracking.map((record) => (
              <tr key={record._id}>
                <td>{record.employee?.name || "Self"}</td>
                <td>{record.year}</td>
                <td>{record.period}</td>
                <td><StatusBadge status={record.status} /></td>
                <td>{record.roRemarks || "-"}</td>
                <td>
                  {user?.role === "ReportingOfficer" && (
                    <div className="inline-form-short">
                      <input
                        placeholder="Add remarks"
                        value={remarks[record._id] || ""}
                        onChange={(e) => setRemarks((prev) => ({ ...prev, [record._id]: e.target.value }))}
                      />
                      <button className="btn" type="button" onClick={() => submitRemarks(record._id)}>
                        Submit
                      </button>
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
