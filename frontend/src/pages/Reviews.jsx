import React, { useEffect, useMemo, useRef, useState } from "react";
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
  const [achievementInputs, setAchievementInputs] = useState({});
  const reviewRowRefs = useRef(new Map());
  const activeCycleId = activeCycle?.cycleId || activeCycle?.id || "";

  const currentReview = useMemo(() => {
    if (!Array.isArray(reviews) || reviews.length === 0) return null;
    return (
      reviews.find((r) => String(r.id) === String(currentAppraisalId)) ||
      reviews.find((r) => activeCycleId && String(r.cycle_id || r.cycleId) === String(activeCycleId)) ||
      null
    );
  }, [reviews, currentAppraisalId, activeCycleId]);

  const isSelfAppraisalLocked = useMemo(
    () => ["self_appraisal_done", "ro_rated", "revo_rated", "ao_accepted", "completed"].includes(currentReview?.status),
    [currentReview?.status]
  );

  const annualRatingStats = useMemo(() => {
    if (appraisalGoals.length === 0) {
      return { total: 0, average: 0 };
    }
    const total = appraisalGoals.length;
    const sum = appraisalGoals.reduce((acc, goal) => {
      const selected = goalRatings[`${currentAppraisalId}-${goal.id}`] ?? goal.selfRating ?? 3;
      return acc + Number(selected);
    }, 0);
    return { total, average: sum / total };
  }, [appraisalGoals, goalRatings, currentAppraisalId]);

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
      const achievementMap = (response.data?.goals || []).reduce((acc, goal) => {
        acc[`${response.data?.appraisalId || ""}-${goal.id}`] = goal.achievementText || "";
        return acc;
      }, {});
      setAchievementInputs(achievementMap);
    } catch (err) {
      console.error("Failed to load goals:", err);
      setAppraisalGoals([]);
      setCurrentAppraisalId("");
      setAchievementInputs({});
    }
  };

  const updateGoalRating = async (goalId, payload) => {
    if (!currentAppraisalId) {
      setError("Unable to save rating right now. Reload the page once.");
      return;
    }
    try {
      const selfRating = Number(payload?.selfRating ?? 3);
      const achievementText = String(payload?.achievementText || "");
      await apiClient.post("/reviews/goal-rating", { appraisalId: currentAppraisalId, goalId, selfRating, achievementText });
      setGoalRatings((prev) => ({ ...prev, [`${currentAppraisalId}-${goalId}`]: selfRating }));
      setAchievementInputs((prev) => ({ ...prev, [`${currentAppraisalId}-${goalId}`]: achievementText }));
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Failed to update goal rating");
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
      await apiClient.post("/reviews/self-summary", {
        ...selfForm,
        cycleId: activeCycleId || undefined
      });
      setSelfForm({ year: new Date().getFullYear(), selfSummary: "" });
      loadReviews();
      loadYearEndGoals();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Unable to submit summary");
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
        <div className="card annual-rating-card">
          <div className="card-header">
            <h2>Annual Goals Rating</h2>
            <span className="muted">Original goal, six-month note, final achievement, and self-rating (1-5)</span>
          </div>
          {isSelfAppraisalLocked && (
            <div className="annual-rating-lock-note">
              Self-appraisal already submitted. Annual goal ratings are now locked.
            </div>
          )}
          <div className="annual-rating-summary">
            <div className="annual-rating-chip">
              <span className="annual-rating-chip-label">Goals</span>
              <strong>{annualRatingStats.total}</strong>
            </div>
            <div className="annual-rating-chip">
              <span className="annual-rating-chip-label">Average</span>
              <strong>{annualRatingStats.average.toFixed(2)} / 5</strong>
            </div>
          </div>

          <div className="annual-rating-list" role="list">
            {appraisalGoals.length === 0 && (
              <div className="annual-rating-empty">No goals found for this cycle.</div>
            )}

            {appraisalGoals.map((goal, index) => (
              <div className="annual-rating-item" role="listitem" key={`${currentAppraisalId || "goal"}-${goal.id}`}>
                <div className="annual-rating-main">
                  <div className="annual-rating-goal-line">
                    <span className="annual-rating-index">Goal {index + 1}</span>
                    <h3 className="annual-rating-goal-title">{goal.goalTitle}</h3>
                  </div>
                  <div className="annual-rating-ref-block">
                    <div className="annual-rating-ref-title">Original Goal (set in goal-setting period)</div>
                    <p className="annual-rating-goal-kpi">{goal.goalDescription || "No KPI description provided."}</p>
                  </div>

                  <div className="annual-rating-ref-block">
                    <div className="annual-rating-ref-title">Six-Month Progress (read-only reference)</div>
                    <p className="annual-rating-progress-note">{goal.sixMonthProgressText || "No six-month progress note submitted."}</p>
                  </div>

                  <div className="annual-rating-ref-block">
                    <label className="annual-rating-ref-title" htmlFor={`goal-achievement-${goal.id}`}>
                      Final Achievement
                    </label>
                    <textarea
                      id={`goal-achievement-${goal.id}`}
                      rows={3}
                      className="annual-rating-achievement"
                      value={achievementInputs[`${currentAppraisalId}-${goal.id}`] ?? goal.achievementText ?? ""}
                      disabled={isSelfAppraisalLocked}
                      onChange={(e) => {
                        const value = e.target.value;
                        setAchievementInputs((prev) => ({ ...prev, [`${currentAppraisalId}-${goal.id}`]: value }));
                      }}
                      onBlur={(e) => {
                        if (isSelfAppraisalLocked) return;
                        const rating = Number(goalRatings[`${currentAppraisalId}-${goal.id}`] ?? goal.selfRating ?? 3);
                        updateGoalRating(goal.id, { selfRating: rating, achievementText: e.target.value });
                      }}
                      placeholder="Example: Both papers now published. Paper 1 accepted in November, Paper 2 accepted in January."
                    />
                  </div>
                </div>

                <div className="annual-rating-control">
                  <label htmlFor={`goal-rating-${goal.id}`}>Rating</label>
                  <select
                    id={`goal-rating-${goal.id}`}
                    className="annual-rating-select"
                    disabled={isSelfAppraisalLocked}
                    value={goalRatings[`${currentAppraisalId}-${goal.id}`] ?? goal.selfRating ?? 3}
                    onChange={(e) => {
                      if (isSelfAppraisalLocked) return;
                      const rating = Number(e.target.value);
                      setGoalRatings((prev) => ({ ...prev, [`${currentAppraisalId}-${goal.id}`]: rating }));
                      updateGoalRating(goal.id, {
                        selfRating: rating,
                        achievementText: achievementInputs[`${currentAppraisalId}-${goal.id}`] ?? goal.achievementText ?? ""
                      });
                    }}
                  >
                    <option value={1}>1 - Poor</option>
                    <option value={2}>2 - Below Avg</option>
                    <option value={3}>3 - Average</option>
                    <option value={4}>4 - Good</option>
                    <option value={5}>5 - Excellent</option>
                  </select>
                </div>
              </div>
            ))}
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
                  disabled={isSelfAppraisalLocked}
                  onChange={(e) => setSelfForm({ ...selfForm, year: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <label>Self Summary</label>
              <textarea
                rows={5}
                value={selfForm.selfSummary}
                disabled={isSelfAppraisalLocked}
                onChange={(e) => setSelfForm({ ...selfForm, selfSummary: e.target.value })}
              />
            </div>
            {error && <div className="error-text">{error}</div>}
            <div className="action-row">
              <button className="btn" type="button" disabled={isSelfAppraisalLocked} onClick={submitSelfSummary}>
                {isSelfAppraisalLocked ? "Submitted" : "Submit Summary"}
              </button>
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
