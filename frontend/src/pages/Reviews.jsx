import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiClient } from "../api/client";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import { ROLES } from "../constants/rbac";
import { isAnnualAppraisalPeriodActive, formatDateDisplay } from "../utils/periodVisibility";

const Reviews = () => {
  const { user, activeCycle } = useAuth();
  const location = useLocation();
  const [reviews, setReviews] = useState([]);
  const [selfForm, setSelfForm] = useState({ year: new Date().getFullYear(), selfSummary: "" });
  const [ratingInputs, setRatingInputs] = useState({});
  const [remarkInputs, setRemarkInputs] = useState({});
  const [error, setError] = useState("");
  const [focusedReviewId, setFocusedReviewId] = useState("");
  const [isAnnualPeriodActive, setIsAnnualPeriodActive] = useState(false);
  const [appraisalGoals, setAppraisalGoals] = useState([]);
  const [currentAppraisalId, setCurrentAppraisalId] = useState("");
  const [goalRatings, setGoalRatings] = useState({});
  const reviewRowRefs = useRef(new Map());
  const activeCycleId = activeCycle?.cycleId || activeCycle?.id || "";

  useEffect(() => {
    setIsAnnualPeriodActive(isAnnualAppraisalPeriodActive(activeCycle));
  }, [activeCycle]);

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

  const loadYearEndGoals = async () => {
    try {
      const params = new URLSearchParams();
      if (activeCycleId) params.set("cycleId", activeCycleId);
      else params.set("year", String(selfForm.year));

      const response = await apiClient.get(`/reviews/my-goals?${params.toString()}`);
      setCurrentAppraisalId(response.data?.appraisalId || "");
      setAppraisalGoals(response.data?.goals || []);
    } catch (err) {
      console.error("Failed to load goals:", err);
      setAppraisalGoals([]);
      setCurrentAppraisalId("");
    }
  };

  const updateGoalRating = async (goalId, rating) => {
    if (!currentAppraisalId) {
      setError("Unable to save rating right now. Reload the page once.");
      return;
    }
    try {
      await apiClient.post("/reviews/goal-rating", { appraisalId: currentAppraisalId, goalId, selfRating: rating });
      setGoalRatings((prev) => ({ ...prev, [`${currentAppraisalId}-${goalId}`]: rating }));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update goal rating");
    }
  };

  useEffect(() => {
    if (user) loadReviews();
  }, [user]);

  useEffect(() => {
    // Show goals in parallel with self-summary form, without waiting for submit.
    if (user?.role === ROLES.EMPLOYEE && isAnnualPeriodActive) {
      loadYearEndGoals();
    }
  }, [user?.role, isAnnualPeriodActive, activeCycleId]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setFocusedReviewId(params.get("focus") || "");
  }, [location.search]);

  useEffect(() => {
    if (!focusedReviewId) return;
    const row = reviewRowRefs.current.get(String(focusedReviewId));
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.classList.add("pulse-highlight");
      const timer = window.setTimeout(() => row.classList.remove("pulse-highlight"), 1800);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [focusedReviewId, reviews]);

  const submitSelfSummary = async () => {
    setError("");
    try {
      await apiClient.post("/reviews/self-summary", selfForm);
      setSelfForm({ year: new Date().getFullYear(), selfSummary: "" });
      loadReviews();
      loadYearEndGoals();
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
      {user?.role === ROLES.EMPLOYEE && !isAnnualPeriodActive && (
        <div className="card" style={{ borderLeft: "4px solid #ff9800" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ fontSize: "24px" }}>⏰</div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>Annual Appraisal Period Not Active</div>
              <div style={{ color: "#666", fontSize: "14px" }}>
                You can submit your self-appraisal only during the annual appraisal period.
                {activeCycle?.annualAppraisalStart && (
                  <>
                    <br />
                    <strong>Period:</strong> {formatDateDisplay(activeCycle.annualAppraisalStart)} to {formatDateDisplay(activeCycle.annualAppraisalEnd)}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {user?.role === ROLES.EMPLOYEE && isAnnualPeriodActive && (
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
              <button className="btn" type="button" onClick={submitSelfSummary}>
                Submit Summary
              </button>
            </div>
          </div>
        </div>
      )}

      {user?.role === ROLES.EMPLOYEE && isAnnualPeriodActive && (
        <div className="card">
          <div className="card-header">
            <h2>Annual Goals Rating</h2>
            <span className="muted">Rate your achievement for each goal (1-5)</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Goal</th>
                <th>KPI (Description)</th>
                <th style={{ width: 120 }}>Goal Rating</th>
              </tr>
            </thead>
            <tbody>
              {appraisalGoals.length === 0 && (
                <tr>
                  <td colSpan={3} className="table-empty">No goals found for this cycle.</td>
                </tr>
              )}
              {appraisalGoals.map((goal) => (
                  <tr key={`${currentAppraisalId || "goal"}-${goal.id}`}>
                    <td>{goal.goalTitle}</td>
                    <td style={{ fontSize: "13px", color: "#666" }}>{goal.goalDescription || "-"}</td>
                    <td>
                      <select
                        value={goalRatings[`${currentAppraisalId}-${goal.id}`] ?? goal.selfRating ?? 3}
                        onChange={(e) => {
                          const rating = Number(e.target.value);
                          setGoalRatings((prev) => ({ ...prev, [`${currentAppraisalId}-${goal.id}`]: rating }));
                          updateGoalRating(goal.id, rating);
                        }}
                        style={{ maxWidth: 100 }}
                      >
                        <option value={1}>1 - Poor</option>
                        <option value={2}>2 - Below Avg</option>
                        <option value={3}>3 - Average</option>
                        <option value={4}>4 - Good</option>
                        <option value={5}>5 - Excellent</option>
                      </select>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
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
              <tr
                key={review.id}
                ref={(node) => {
                  if (node) {
                    reviewRowRefs.current.set(String(review.id), node);
                  } else {
                    reviewRowRefs.current.delete(String(review.id));
                  }
                }}
                className={String(focusedReviewId) === String(review.id) ? "row-highlight" : ""}
              >
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
