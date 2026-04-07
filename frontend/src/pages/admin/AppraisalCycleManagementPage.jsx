import React, { useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import { formatDateDisplay, toInputDate } from "../../utils/dateFormat";

const AppraisalCycleManagementPage = () => {
  const [cycles, setCycles] = useState([]);
  const [cycleForm, setCycleForm] = useState({
    name: `Annual Appraisal ${new Date().getFullYear()}`,
    year: new Date().getFullYear(),
    goalSettingStart: `${new Date().getFullYear()}-01-01`,
    goalSettingEnd: `${new Date().getFullYear()}-01-31`,
    sixMonthProgressReviewStart: `${new Date().getFullYear()}-06-01`,
    sixMonthProgressReviewEnd: `${new Date().getFullYear()}-06-30`,
    annualAppraisalStart: `${new Date().getFullYear()}-11-01`,
    annualAppraisalEnd: `${new Date().getFullYear()}-12-31`,
    isActive: true,
    status: "active"
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadCycles = async () => {
    try {
      const response = await apiClient.get("/admin/cycles");
      setCycles(response.data || []);
    } catch {
      setCycles([]);
    }
  };

  useEffect(() => {
    loadCycles();
  }, []);

  const createCycle = async () => {
    setError("");
    setSuccess("");
    try {
      const duplicate = cycles.find((cycle) => Number(cycle.year) === Number(cycleForm.year));
      if (duplicate) {
        setError("An appraisal cycle already exists for this year.");
        return;
      }
      await apiClient.post("/admin/cycles", cycleForm);
      setSuccess("Appraisal cycle created.");
      loadCycles();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Unable to create cycle");
    }
  };

  return (
    <div className="page-content">
      <div className="card">
        <div className="card-header">
          <h2>Appraisal Cycle Management</h2>
        </div>
        <div className="form-grid">
          <div className="form-row">
            <div>
              <label>Cycle Name</label>
              <input value={cycleForm.name} onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })} />
            </div>
            <div>
              <label>Year</label>
              <input type="number" value={cycleForm.year} onChange={(e) => setCycleForm({ ...cycleForm, year: Number(e.target.value) })} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Goal Setting Start</label>
              <input type="date" value={toInputDate(cycleForm.goalSettingStart)} onChange={(e) => setCycleForm({ ...cycleForm, goalSettingStart: e.target.value })} />
            </div>
            <div>
              <label>Goal Setting End</label>
              <input type="date" value={toInputDate(cycleForm.goalSettingEnd)} onChange={(e) => setCycleForm({ ...cycleForm, goalSettingEnd: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Six-Month Review Start</label>
              <input type="date" value={toInputDate(cycleForm.sixMonthProgressReviewStart)} onChange={(e) => setCycleForm({ ...cycleForm, sixMonthProgressReviewStart: e.target.value })} />
            </div>
            <div>
              <label>Six-Month Review End</label>
              <input type="date" value={toInputDate(cycleForm.sixMonthProgressReviewEnd)} onChange={(e) => setCycleForm({ ...cycleForm, sixMonthProgressReviewEnd: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Annual Appraisal Start</label>
              <input type="date" value={toInputDate(cycleForm.annualAppraisalStart)} onChange={(e) => setCycleForm({ ...cycleForm, annualAppraisalStart: e.target.value })} />
            </div>
            <div>
              <label>Annual Appraisal End</label>
              <input type="date" value={toInputDate(cycleForm.annualAppraisalEnd)} onChange={(e) => setCycleForm({ ...cycleForm, annualAppraisalEnd: e.target.value })} />
            </div>
          </div>
          {error && <div className="error-text">{error}</div>}
          {success && <div className="success-text">{success}</div>}
          <div className="action-row">
            <button className="btn" type="button" onClick={createCycle}>Create Active Cycle</button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Year</th><th>Goal Setting</th><th>Six-Month</th><th>Annual</th><th>Status</th><th>Active</th></tr>
              </thead>
              <tbody>
                {cycles.map((cycle) => (
                  <tr key={cycle.id}>
                    <td>{cycle.name}</td>
                    <td>{cycle.year}</td>
                    <td>{formatDateDisplay(cycle.goalSettingStart)} - {formatDateDisplay(cycle.goalSettingEnd)}</td>
                    <td>{formatDateDisplay(cycle.sixMonthProgressReviewStart)} - {formatDateDisplay(cycle.sixMonthProgressReviewEnd)}</td>
                    <td>{formatDateDisplay(cycle.annualAppraisalStart)} - {formatDateDisplay(cycle.annualAppraisalEnd)}</td>
                    <td>{cycle.status}</td>
                    <td>{cycle.isActive ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppraisalCycleManagementPage;
