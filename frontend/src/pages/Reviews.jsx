import React, { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import { ROLES } from "../constants/rbac";

const Reviews = () => {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [selfForm, setSelfForm] = useState({ year: new Date().getFullYear(), selfSummary: "" });
  const [ratingInputs, setRatingInputs] = useState({});
  const [remarkInputs, setRemarkInputs] = useState({});
  const [error, setError] = useState("");

  const loadReviews = async () => {
    try {
      if (user?.role === ROLES.EMPLOYEE) {
        const response = await apiClient.get("/reviews/my");
        setReviews(response.data);
      } else {
        const response = await apiClient.get("/reviews/queue");
        setReviews(response.data);
      }
    } catch {
      setReviews([]);
    }
  };

  useEffect(() => {
    if (user) loadReviews();
  }, [user]);

  const submitSelfSummary = async () => {
    setError("");
    try {
      await apiClient.post("/reviews/self-summary", selfForm);
      setSelfForm({ year: new Date().getFullYear(), selfSummary: "" });
      loadReviews();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to submit summary");
    }
  };

  const submitRating = async (reviewId) => {
    setError("");
    try {
      const payload = ratingInputs[reviewId] || { score: 3, remarks: "" };
      await apiClient.post("/reviews/ro-rate", { reviewId, score: Number(payload.score), remarks: payload.remarks });
      loadReviews();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to submit rating");
    }
  };

  const submitRemarks = async (reviewId, endpoint) => {
    setError("");
    try {
      const remarks = remarkInputs[reviewId] || "";
      await apiClient.post(endpoint, { reviewId, remarks, score: 3 });
      loadReviews();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to submit remarks");
    }
  };

  return (
    <div className="page-content">
      {user?.role === ROLES.EMPLOYEE && (
        <div className="card">
          <div className="card-header">
            <h2>Self Appraisal</h2>
            <span className="muted">Submit your annual self-appraisal</span>
          </div>
          <div className="form-grid">
            <div className="form-row">
              <div style={{ maxWidth: 180 }}>
                <label>Performance Year</label>
                <input
                  type="number"
                  value={selfForm.year}
                  onChange={(e) => setSelfForm({ ...selfForm, year: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <label>Self Summary</label>
              <textarea
                rows={5}
                value={selfForm.selfSummary}
                onChange={(e) => setSelfForm({ ...selfForm, selfSummary: e.target.value })}
              />
            </div>
            {error && <div className="error-text">{error}</div>}
            <div className="action-row">
              <button className="btn" type="button" onClick={submitSelfSummary}>Submit Summary</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Review Workflow</h2>
          <span className="muted">{reviews.length} record{reviews.length !== 1 ? "s" : ""}</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Cycle</th>
              <th>Status</th>
              <th>Final Score</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {reviews.length === 0 && <tr><td colSpan={5} className="table-empty">No reviews found.</td></tr>}
            {reviews.map((review) => (
              <tr key={review.id}>
                <td>{review.employee?.name || "Self"}</td>
                <td>{review.cycle?.name || review.cycle?.year || "-"}</td>
                <td><StatusBadge status={review.status} /></td>
                <td>{review.finalScore ? Number(review.finalScore).toFixed(2) : "-"}</td>
                <td>
                  {user?.role === ROLES.REPORTING_OFFICER && (
                    <div className="inline-form">
                      <input
                        type="number"
                        min={1}
                        max={5}
                        placeholder="Score (1-5)"
                        value={ratingInputs[review.id]?.score || ""}
                        onChange={(e) => setRatingInputs((prev) => ({ ...prev, [review.id]: { ...prev[review.id], score: e.target.value } }))}
                      />
                      <input
                        placeholder="Remarks"
                        value={ratingInputs[review.id]?.remarks || ""}
                        onChange={(e) => setRatingInputs((prev) => ({ ...prev, [review.id]: { ...prev[review.id], remarks: e.target.value } }))}
                      />
                      <button className="btn" type="button" onClick={() => submitRating(review.id)}>Submit</button>
                    </div>
                  )}
                  {user?.role === ROLES.REVIEWING_OFFICER && (
                    <div className="inline-form-short">
                      <input
                        placeholder="Remarks"
                        value={remarkInputs[review.id] || ""}
                        onChange={(e) => setRemarkInputs((prev) => ({ ...prev, [review.id]: e.target.value }))}
                      />
                      <button className="btn" type="button" onClick={() => submitRemarks(review.id, "/reviews/review-approve")}>Approve</button>
                    </div>
                  )}
                  {user?.role === ROLES.ACCEPTING_OFFICER && (
                    <div className="inline-form-short">
                      <input
                        placeholder="Final remarks"
                        value={remarkInputs[review.id] || ""}
                        onChange={(e) => setRemarkInputs((prev) => ({ ...prev, [review.id]: e.target.value }))}
                      />
                      <button className="btn" type="button" onClick={() => submitRemarks(review.id, "/reviews/accept")}>Finalize</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {error && <div className="error-text" style={{ padding: "12px 0" }}>{error}</div>}
      </div>
    </div>
  );
};

export default Reviews;
