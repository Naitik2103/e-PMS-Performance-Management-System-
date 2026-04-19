import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiClient } from "../api/client";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import { ROLES, roleMatches } from "../constants/rbac";
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
  const [achievementInputs, setAchievementInputs] = useState({});
  const [isAnnualGoalsSubmitted, setIsAnnualGoalsSubmitted] = useState(false);
  const [persistedSelfSummary, setPersistedSelfSummary] = useState("");
  const [persistedAchievementsComplete, setPersistedAchievementsComplete] = useState(false);
  const [currentAppraisalStatus, setCurrentAppraisalStatus] = useState("");
  const [appraisalAttributeRatings, setAppraisalAttributeRatings] = useState([]);
  const [selectedReview, setSelectedReview] = useState(null);
  const [selectedReviewGoals, setSelectedReviewGoals] = useState([]);
  const [selectedReviewInputs, setSelectedReviewInputs] = useState({});
  const [attributeMasters, setAttributeMasters] = useState([]);
  const [selectedReviewAttributeInputs, setSelectedReviewAttributeInputs] = useState({});
  const [selectedReviewLoading, setSelectedReviewLoading] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedEmployeeName, setSelectedEmployeeName] = useState("");
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const reviewRowRefs = useRef(new Map());
  const autoOpenedEmployeeRef = useRef("");
  const activeCycleId = activeCycle?.cycleId || activeCycle?.id || "";
  const activeRole = user?.selectedRole || user?.role;

  const currentReview = useMemo(() => {
    if (!Array.isArray(reviews) || reviews.length === 0) return null;
    return (
      reviews.find((r) => String(r.id) === String(currentAppraisalId)) ||
      reviews.find((r) => activeCycleId && String(r.cycle_id || r.cycleId) === String(activeCycleId)) ||
      null
    );
  }, [reviews, currentAppraisalId, activeCycleId]);

  const allFinalAchievementsFilled = useMemo(
    () => appraisalGoals.length > 0 && appraisalGoals.every((goal) => {
      const value = achievementInputs[`${currentAppraisalId}-${goal.id}`] ?? goal.achievementText ?? "";
      return String(value).trim().length > 0;
    }),
    [appraisalGoals, achievementInputs, currentAppraisalId]
  );

  const hasPersistedSelfSummary = useMemo(() => String(persistedSelfSummary || "").trim().length > 0, [persistedSelfSummary]);

  const isSelfAppraisalLocked = useMemo(() => {
    const statusForLock = currentAppraisalStatus || currentReview?.status;
    const isLockedStage = ["self_appraisal_done", "ro_rated", "revo_rated", "ao_accepted", "completed"].includes(statusForLock);
    return isLockedStage && hasPersistedSelfSummary && persistedAchievementsComplete;
  }, [currentAppraisalStatus, currentReview?.status, hasPersistedSelfSummary, persistedAchievementsComplete]);

  const selectedReviewStage = useMemo(() => {
    if (!selectedReview) return null;
    if (selectedReview.status === "self_appraisal_done") {
      return {
        label: "Reporting Officer Review",
        ratingKey: "roRating",
        remarksKey: "roRemarks"
      };
    }
    if (selectedReview.status === "ro_rated") {
      return {
        label: "Reviewing Officer Review",
        ratingKey: "revoRating",
        remarksKey: "revoRemarks"
      };
    }
    if (selectedReview.status === "revo_rated") {
      return {
        label: "Accepting Officer Review",
        ratingKey: "aoRating",
        remarksKey: "aoRemarks"
      };
    }
    return null;
  }, [selectedReview]);

  const selectedReviewComplete = useMemo(() => {
    if (!selectedReviewStage || !selectedReviewGoals.length) return false;
    const goalsDone = selectedReviewGoals.every((goal) => {
      const current = selectedReviewInputs[goal.id] || {};
      const rating = Number(current.rating ?? goal[selectedReviewStage.ratingKey] ?? 0);
      const remarks = String(current.remarks ?? goal[selectedReviewStage.remarksKey] ?? "").trim();
      return rating >= 1 && rating <= 5 && remarks.length > 0;
    });

    const attrsDone = attributeMasters.length === 0 || attributeMasters.every(attr => {
      const current = selectedReviewAttributeInputs[attr.id] || {};
      const rating = Number(current.rating || 0);
      return rating >= 1 && rating <= 5;
    });

    return goalsDone && attrsDone;
  }, [selectedReviewStage, selectedReviewGoals, selectedReviewInputs, attributeMasters, selectedReviewAttributeInputs]);

  const visibleReviews = useMemo(() => {
    let filtered = reviews;
    if (selectedEmployeeId) {
      filtered = filtered.filter((review) => String(review.employee?.id || review.employee_id || "") === String(selectedEmployeeId));
    }
    if (selectedCycleId) {
      filtered = filtered.filter((review) => String(review.cycle_id || review.cycleId || "") === String(selectedCycleId));
    }
    return filtered;
  }, [reviews, selectedEmployeeId, selectedCycleId]);

  useEffect(() => {
    setIsAnnualPeriodActive(isAnnualAppraisalPeriodActive(activeCycle));
  }, [activeCycle]);

  useEffect(() => {
    const fetchAttributes = async () => {
      try {
        const res = await apiClient.get("/reviews/attributes/master");
        setAttributeMasters(res.data || []);
      } catch (err) {
        console.error("Failed to fetch attribute masters", err);
      }
    };
    if (user) {
      fetchAttributes();
    }
  }, [user]);

  const loadReviews = async () => {
    try {
      if (activeRole === ROLES.EMPLOYEE) {
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
      setCurrentAppraisalStatus(String(response.data?.appraisalStatus || ""));
      setAppraisalGoals(response.data?.goals || []);
      setIsAnnualGoalsSubmitted(false);
      const apiSummary = String(response.data?.selfSummary || "");
      setPersistedSelfSummary(apiSummary);
      setPersistedAchievementsComplete(Boolean(response.data?.persistedAchievementsComplete));
      setSelfForm((prev) => ({ ...prev, selfSummary: apiSummary }));
      const achievementMap = (response.data?.goals || []).reduce((acc, goal) => {
        acc[`${response.data?.appraisalId || ""}-${goal.id}`] = goal.achievementText || "";
        return acc;
      }, {});
      setAchievementInputs(achievementMap);
      setAppraisalAttributeRatings(response.data?.attributeRatings || []);
    } catch (err) {
      console.error("Failed to load goals:", err);
      setAppraisalGoals([]);
      setCurrentAppraisalId("");
      setCurrentAppraisalStatus("");
      setPersistedSelfSummary("");
      setPersistedAchievementsComplete(false);
      setAchievementInputs({});
      setAppraisalAttributeRatings([]);
    }
  };

  const openReview = async (review) => {
    setSelectedReviewLoading(true);
    setError("");
    try {
      const response = await apiClient.get(`/reviews/${review.id}/goals`);
      const goals = response.data?.goals || [];
      setSelectedReview({
        ...review,
        detailStage: response.data?.stage || null,
        canEdit: response.data?.canEdit,
        selfSummary: response.data?.selfSummary || response.data?.self_summary || ""
      });
      setSelectedReviewGoals(goals);
      const initialInputs = goals.reduce((acc, goal) => {
        const stage = response.data?.stage;
        const ratingKey = stage === ROLES.REPORTING_OFFICER ? "roRating" : stage === ROLES.REVIEWING_OFFICER ? "revoRating" : "aoRating";
        const remarksKey = stage === ROLES.REPORTING_OFFICER ? "roRemarks" : stage === ROLES.REVIEWING_OFFICER ? "revoRemarks" : "aoRemarks";
        acc[goal.id] = {
          rating: goal[ratingKey] ?? "",
          remarks: goal[remarksKey] ?? ""
        };
        return acc;
      }, {});
      setSelectedReviewInputs(initialInputs);

      const attrRatings = response.data?.attributeRatings || [];
      const attrInputs = {};
      const currentRoleKey = response.data?.stage;

      attributeMasters.forEach(attr => {
        const existing = attrRatings.find(r => String(r.attributeId) === String(attr.id) && String(r.ratedByRole) === String(currentRoleKey));
        attrInputs[attr.id] = {
          rating: existing ? existing.rating : "",
          category: attr.category,
          attributeKey: attr.attributeName
        };
      });
      setSelectedReviewAttributeInputs(attrInputs);
      setSelectedReview(prev => ({ ...prev, attributeRatings: attrRatings }));
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Unable to load review goals");
    } finally {
      setSelectedReviewLoading(false);
    }
  };

  const submitSelectedReview = async () => {
    if (!selectedReview) return;
    setError("");
    try {
      const goalRatings = selectedReviewGoals.map((goal) => {
        const current = selectedReviewInputs[goal.id] || {};
        return {
          goalId: goal.id,
          rating: Number(current.rating || 0),
          remarks: String(current.remarks || "").trim()
        };
      });

      const attributeRatingsPayload = attributeMasters.map(attr => {
        const current = selectedReviewAttributeInputs[attr.id] || {};
        return {
          attributeId: attr.id,
          rating: Number(current.rating || 0),
          category: attr.category,
          attributeKey: attr.attributeName
        };
      });

      await apiClient.post("/reviews/goal-stage-submit", {
        appraisalId: selectedReview.id,
        goalRatings,
        attributeRatings: attributeRatingsPayload
      });

      setSelectedReview(null);
      setSelectedReviewGoals([]);
      setSelectedReviewInputs({});
      loadReviews();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Unable to submit goal review");
    }
  };

  const updateGoalRating = async (goalId, payload) => {
    if (!currentAppraisalId) {
      setError("Unable to save rating right now. Reload the page once.");
      return;
    }
    try {
      const achievementText = String(payload?.achievementText || "");
      await apiClient.post("/reviews/goal-rating", { appraisalId: currentAppraisalId, goalId, achievementText });
      setAchievementInputs((prev) => ({ ...prev, [`${currentAppraisalId}-${goalId}`]: achievementText }));
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Failed to update goal rating");
      throw err;
    }
  };

  const submitAnnualGoals = async () => {
    setError("");
    try {
      const goalPayload = appraisalGoals.map((goal) => ({
        goalId: goal.id,
        achievementText: String(achievementInputs[`${currentAppraisalId}-${goal.id}`] ?? goal.achievementText ?? "").trim()
      }));

      for (const goal of goalPayload) {
        await updateGoalRating(goal.goalId, { achievementText: goal.achievementText });
      }

      await apiClient.post("/reviews/annual-goals/submit", {
        appraisalId: currentAppraisalId,
        goals: goalPayload
      });
      setIsAnnualGoalsSubmitted(true);
      await Promise.all([loadReviews(), loadYearEndGoals()]);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Unable to submit annual goals");
    }
  };

  useEffect(() => {
    if (user) loadReviews();
  }, [user]);

  useEffect(() => {
    // Show goals in parallel with self-summary form, without waiting for submit.
    if (activeRole === ROLES.EMPLOYEE) {
      loadYearEndGoals();
    }
  }, [activeRole, activeCycleId]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setFocusedReviewId(params.get("focus") || "");
    setSelectedEmployeeId(params.get("employeeId") || "");
    setSelectedEmployeeName(params.get("employeeName") || "");
    setSelectedCycleId(params.get("cycleId") || "");
  }, [location.search]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      autoOpenedEmployeeRef.current = "";
      return;
    }
    const matched = visibleReviews[0] || null;
    if (!matched) return;
    const openKey = `${selectedEmployeeId}:${selectedCycleId || "all"}`;
    if (autoOpenedEmployeeRef.current === openKey) return;
    autoOpenedEmployeeRef.current = openKey;
    openReview(matched);
  }, [selectedEmployeeId, selectedCycleId, visibleReviews]);

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
      {activeRole === ROLES.EMPLOYEE && !isAnnualPeriodActive && (
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

      {activeRole === ROLES.EMPLOYEE && (
        <div className="card annual-rating-card">
          <div className="card-header">
            <h2>Annual Goals</h2>
            <span className="muted">Original goal, six-month note, and final achievement</span>
          </div>
          {isSelfAppraisalLocked && (
            <div className="annual-rating-lock-note">
              Self-appraisal already submitted. Annual goals are now locked.
            </div>
          )}

          <div className="annual-rating-list" role="list">
            {appraisalGoals.length === 0 && (
              <div className="annual-rating-empty">No goals, no progress, and no actual achievement found for this year.</div>
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
                      disabled={isSelfAppraisalLocked || !isAnnualPeriodActive}
                      onChange={(e) => {
                        const value = e.target.value;
                        setAchievementInputs((prev) => ({ ...prev, [`${currentAppraisalId}-${goal.id}`]: value }));
                      }}
                      onBlur={(e) => {
                        if (isSelfAppraisalLocked) return;
                        updateGoalRating(goal.id, { achievementText: e.target.value }).catch(() => {});
                      }}
                      placeholder="Example: Both papers now published. Paper 1 accepted in November, Paper 2 accepted in January."
                    />
                  </div>
                  {goal.roRating && (
                    <>
                      <div className="annual-rating-ref-block">
                        <div className="annual-rating-ref-title">RO Rating</div>
                        <p className="annual-rating-progress-note">{goal.roRating} / 5</p>
                      </div>
                      <div className="annual-rating-ref-block">
                        <div className="annual-rating-ref-title">RO Remarks</div>
                        <p className="annual-rating-progress-note">{goal.roRemarks || "No remarks provided."}</p>
                      </div>
                    </>
                  )}
                  {goal.revoRating && (
                    <>
                      <div className="annual-rating-ref-block">
                        <div className="annual-rating-ref-title">Reviewing Officer Rating</div>
                        <p className="annual-rating-progress-note">{goal.revoRating} / 5</p>
                      </div>
                      <div className="annual-rating-ref-block">
                        <div className="annual-rating-ref-title">Reviewing Officer Remarks</div>
                        <p className="annual-rating-progress-note">{goal.revoRemarks || "No remarks provided."}</p>
                      </div>
                    </>
                  )}
                  {goal.aoRating && (
                    <>
                      <div className="annual-rating-ref-block">
                        <div className="annual-rating-ref-title">Accepting Officer Rating</div>
                        <p className="annual-rating-progress-note">{goal.aoRating} / 5</p>
                      </div>
                      <div className="annual-rating-ref-block">
                        <div className="annual-rating-ref-title">Accepting Officer Remarks</div>
                        <p className="annual-rating-progress-note">{goal.aoRemarks || "No remarks provided."}</p>
                      </div>
                    </>
                  )}
                </div>

              </div>
            ))}
          </div>

          {!isSelfAppraisalLocked && isAnnualPeriodActive && allFinalAchievementsFilled && !isAnnualGoalsSubmitted && (
            <div className="action-row" style={{ marginTop: "20px" }}>
              <button className="btn" type="button" onClick={submitAnnualGoals}>
                Submit Annual Goals
              </button>
            </div>
          )}

          {!isSelfAppraisalLocked && !allFinalAchievementsFilled && appraisalGoals.length > 0 && (
            <div className="muted" style={{ marginTop: "16px" }}>
              Fill every final achievement to enable submission.
            </div>
          )}

          {/* Employee Quantitative Attributes View */}
          {activeRole === ROLES.EMPLOYEE && ["ao_accepted", "completed"].includes((currentAppraisalStatus || "").toLowerCase()) && appraisalAttributeRatings.length > 0 && (
            <div style={{ marginTop: "30px", borderTop: "1px solid #eee", paddingTop: "20px" }}>
              <h2 style={{ marginBottom: "20px" }}>Quantitative Attributes</h2>
              {[...new Set(attributeMasters.map(a => a.category))].map(cat => {
                const catAttrs = attributeMasters.filter(a => a.category === cat);
                
                const calculateAverage = (category, role) => {
                  const relevantRatings = appraisalAttributeRatings.filter(r => r.category === category && String(r.ratedByRole) === String(role));
                  if (relevantRatings.length === 0) return "0.00";
                  const sum = relevantRatings.reduce((s, r) => s + Number(r.rating || 0), 0);
                  return (sum / relevantRatings.length).toFixed(2);
                };

                return (
                  <div key={cat} style={{ marginBottom: "24px" }}>
                    <div style={{ backgroundColor: "#f8fafc", padding: "12px 16px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <h3 style={{ margin: 0, fontSize: "16px", color: "#334155" }}>{cat}</h3>
                      </div>
                      <div style={{ display: "flex", gap: "20px", fontSize: "13px" }}>
                        <span style={{ color: "#64748b" }}>RO Avg: <strong style={{ color: "#2563eb" }}>{calculateAverage(cat, ROLES.REPORTING_OFFICER)}</strong></span>
                        <span style={{ color: "#64748b" }}>Reviewing Avg: <strong style={{ color: "#2563eb" }}>{calculateAverage(cat, ROLES.REVIEWING_OFFICER)}</strong></span>
                        <span style={{ color: "#64748b" }}>Accepting Avg: <strong style={{ color: "#2563eb" }}>{calculateAverage(cat, ROLES.ACCEPTING_OFFICER)}</strong></span>
                      </div>
                    </div>
                    <div className="table-wrap" style={{ marginTop: "12px" }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th style={{ width: "30%" }}>Attribute</th>
                            <th>RO Rating</th>
                            <th>Reviewing Rating</th>
                            <th>Accepting Rating</th>
                          </tr>
                        </thead>
                        <tbody>
                          {catAttrs.map(attr => {
                            const getRating = (roleKey) => {
                              const found = appraisalAttributeRatings.find(r => 
                                String(r.attributeId) === String(attr.id) && 
                                String(r.ratedByRole) === String(roleKey)
                              );
                              return found ? found.rating : "-";
                            };

                            return (
                              <tr key={attr.id}>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{attr.attributeName}</div>
                                  <div className="muted small" style={{ marginTop: "4px" }}>{attr.description}</div>
                                </td>
                                <td style={{ textAlign: "center", fontWeight: 500 }}>{getRating(ROLES.REPORTING_OFFICER)}</td>
                                <td style={{ textAlign: "center", fontWeight: 500 }}>{getRating(ROLES.REVIEWING_OFFICER)}</td>
                                <td style={{ textAlign: "center", fontWeight: 500 }}>{getRating(ROLES.ACCEPTING_OFFICER)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeRole === ROLES.EMPLOYEE && (isAnnualPeriodActive || hasPersistedSelfSummary) && (
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
                  disabled={isSelfAppraisalLocked || !isAnnualPeriodActive}
                  onChange={(e) => setSelfForm({ ...selfForm, year: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <label>Self Summary</label>
              <textarea
                rows={5}
                value={selfForm.selfSummary}
                disabled={isSelfAppraisalLocked || !isAnnualPeriodActive}
                onChange={(e) => setSelfForm({ ...selfForm, selfSummary: e.target.value })}
              />
            </div>
            {error && <div className="error-text">{error}</div>}
            <div className="action-row">
              <button className="btn" type="button" disabled={isSelfAppraisalLocked || !isAnnualPeriodActive || !String(selfForm.selfSummary || "").trim()} onClick={submitSelfSummary}>
                {isSelfAppraisalLocked ? "Submitted" : "Submit Summary"}
              </button>
            </div>
            {!isSelfAppraisalLocked && !String(selfForm.selfSummary || "").trim() && (
              <div className="muted">Enter self summary to enable submission.</div>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Review Workflow</h2>
          <span className="muted">
            {visibleReviews.length} record{visibleReviews.length !== 1 ? "s" : ""}
            {selectedEmployeeId && ` for ${selectedEmployeeName || "selected employee"}`}
          </span>
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
            {visibleReviews.length === 0 && <tr><td colSpan={5} className="table-empty">No reviews found.</td></tr>}
            {visibleReviews.map((review) => (
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
                  {(activeRole === ROLES.REPORTING_OFFICER || activeRole === ROLES.REVIEWING_OFFICER || activeRole === ROLES.ACCEPTING_OFFICER || (activeRole === ROLES.EMPLOYEE && ["ao_accepted", "completed"].includes(review.status))) && (
                    <button className="btn" type="button" onClick={() => openReview(review)}>
                      {selectedReview?.id === review.id ? "Review Open" : (activeRole === ROLES.EMPLOYEE ? "View Details" : "Open Review")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {selectedEmployeeId && visibleReviews.length === 0 && (
          <div className="muted" style={{ marginTop: "10px" }}>
            No year-end appraisal record found yet for {selectedEmployeeName || "this employee"}.
          </div>
        )}
        {selectedReview && (
          <div className="card" style={{ marginTop: "20px" }}>
            <div className="card-header">
              <h2>{selectedReviewStage?.label || "Goal Review"}</h2>
              <span className="muted">
                {selectedReview.employee?.name || "Employee"} · {selectedReview.cycle?.name || selectedReview.cycle?.year || "-"}
              </span>
            </div>
            {selectedReviewLoading ? (
              <div className="muted">Loading goal details...</div>
            ) : (
              <>
                <div className="card" style={{ marginBottom: "12px" }}>
                  <div className="card-header">
                    <h3>Employee Self-Appraisal Summary</h3>
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                    {String(selectedReview.selfSummary || "").trim() || "No self-appraisal summary submitted."}
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Goal</th>
                        <th>Original Goal</th>
                        <th>Six-Month Progress</th>
                        <th>Actual Achievement</th>
                        <th>RO Rating</th>
                        <th>RO Remarks</th>
                        <th>Reviewing Rating</th>
                        <th>Reviewing Remarks</th>
                        <th>Accepting Rating</th>
                        <th>Accepting Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReviewGoals.length === 0 && (
                        <tr><td colSpan={6} className="table-empty">No goals found for this appraisal.</td></tr>
                      )}
                      {selectedReviewGoals.map((goal, index) => {
                        const current = selectedReviewInputs[goal.id] || {};
                        const canEdit = Boolean(selectedReviewStage && selectedReview?.canEdit);
                        const stageRatingKey = selectedReviewStage?.ratingKey;
                        const stageRemarksKey = selectedReviewStage?.remarksKey;
                        const ratingValue = current.rating ?? (canEdit ? goal[stageRatingKey] : goal.revoRating) ?? "";
                        const remarksValue = current.remarks ?? (canEdit ? goal[stageRemarksKey] : goal.revoRemarks) ?? "";
                        const sixMonthText = goal.sixMonthProgressText ?? goal.six_month_progress_text ?? "";
                        const achievementText = goal.achievementText ?? goal.achievement_text ?? "";
                        return (
                          <tr key={goal.id}>
                            <td>
                              <strong>Goal {index + 1}</strong>
                              <div className="muted small">{goal.goalTitle}</div>
                            </td>
                            <td>{goal.goalDescription || "-"}</td>
                            <td>{sixMonthText || "No six-month progress note submitted."}</td>
                            <td>{achievementText || "No actual achievement submitted."}</td>
                            <td>
                              {canEdit && stageRatingKey === "roRating" ? (
                                <select
                                  value={ratingValue}
                                  onChange={(e) => setSelectedReviewInputs((prev) => ({
                                    ...prev,
                                    [goal.id]: { ...prev[goal.id], rating: e.target.value, remarks: prev[goal.id]?.remarks ?? remarksValue }
                                  }))}
                                >
                                  <option value="">Select</option>
                                  {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}
                                </select>
                              ) : (
                                goal.roRating || "-"
                              )}
                            </td>
                            <td>
                              {canEdit && stageRemarksKey === "roRemarks" ? (
                                <textarea
                                  rows={2}
                                  value={remarksValue}
                                  onChange={(e) => setSelectedReviewInputs((prev) => ({
                                    ...prev,
                                    [goal.id]: { ...prev[goal.id], remarks: e.target.value }
                                  }))}
                                />
                              ) : (
                                goal.roRemarks || "-"
                              )}
                            </td>
                            
                            {/* Reviewing Officer Columns */}
                            <td>
                              {canEdit && stageRatingKey === "revoRating" ? (
                                <select
                                  value={ratingValue}
                                  onChange={(e) => setSelectedReviewInputs((prev) => ({
                                    ...prev,
                                    [goal.id]: { ...prev[goal.id], rating: e.target.value, remarks: prev[goal.id]?.remarks ?? remarksValue }
                                  }))}
                                >
                                  <option value="">Select</option>
                                  {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}
                                </select>
                              ) : (
                                goal.revoRating || "-"
                              )}
                            </td>
                            <td>
                              {canEdit && stageRemarksKey === "revoRemarks" ? (
                                <textarea
                                  rows={2}
                                  value={remarksValue}
                                  onChange={(e) => setSelectedReviewInputs((prev) => ({
                                    ...prev,
                                    [goal.id]: { ...prev[goal.id], remarks: e.target.value }
                                  }))}
                                />
                              ) : (
                                goal.revoRemarks || "-"
                              )}
                            </td>

                            {/* Accepting Officer Columns */}
                            <td>
                              {canEdit && stageRatingKey === "aoRating" ? (
                                <select
                                  value={ratingValue}
                                  onChange={(e) => setSelectedReviewInputs((prev) => ({
                                    ...prev,
                                    [goal.id]: { ...prev[goal.id], rating: e.target.value, remarks: prev[goal.id]?.remarks ?? remarksValue }
                                  }))}
                                >
                                  <option value="">Select</option>
                                  {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}
                                </select>
                              ) : (
                                goal.aoRating || "-"
                              )}
                            </td>
                            <td>
                              {canEdit && stageRemarksKey === "aoRemarks" ? (
                                <textarea
                                  rows={2}
                                  value={remarksValue}
                                  onChange={(e) => setSelectedReviewInputs((prev) => ({
                                    ...prev,
                                    [goal.id]: { ...prev[goal.id], remarks: e.target.value }
                                  }))}
                                />
                              ) : (
                                goal.aoRemarks || "-"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Quantitative Attributes UI */}
                {attributeMasters.length > 0 && (
                  activeRole !== ROLES.EMPLOYEE ? 
                  ["self_appraisal_done", "ro_rated", "revo_rated", "ao_accepted", "completed"].includes((selectedReview?.status || "").toLowerCase()) :
                  ["ao_accepted", "completed"].includes((selectedReview?.status || "").toLowerCase())
                ) && (
                  <div style={{ marginTop: "30px" }}>
                    <h3>Quantitative Attributes</h3>
                    {[...new Set(attributeMasters.map(a => a.category))].map(cat => {
                      const catAttrs = attributeMasters.filter(a => a.category === cat);
                      
                      const calculateLiveAverage = (category) => {
                        let sum = 0;
                        let count = 0;
                        attributeMasters.filter(a => a.category === category).forEach(attr => {
                          const val = Number(selectedReviewAttributeInputs[attr.id]?.rating || 0);
                          if (val > 0) { sum += val; count++; }
                        });
                        return count > 0 ? (sum / count).toFixed(2) : "0.00";
                      };

                      return (
                        <div key={cat} style={{ marginBottom: "20px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#f5f5f5", padding: "10px", borderRadius: "4px" }}>
                            <h4 style={{ margin: 0 }}>{cat}</h4>
                            <strong style={{ color: "#1976d2" }}>Section Average: {calculateLiveAverage(cat)}</strong>
                          </div>
                          <table className="table" style={{ marginTop: "10px" }}>
                            <thead>
                              <tr>
                                <th style={{ width: "25%" }}>Attribute</th>
                                <th style={{ width: "40%" }}>Description</th>
                                <th>RO Rating</th>
                                <th>Reviewing Rating</th>
                                <th>Accepting Rating</th>
                              </tr>
                            </thead>
                            <tbody>
                              {catAttrs.map(attr => {
                                const current = selectedReviewAttributeInputs[attr.id] || {};
                                const canEdit = Boolean(selectedReviewStage && selectedReview?.canEdit);
                                const isRo = selectedReviewStage?.ratingKey === "roRating";
                                const isRevo = selectedReviewStage?.ratingKey === "revoRating";
                                const isAo = selectedReviewStage?.ratingKey === "aoRating";

                                const getRoleRating = (roleKey) => {
                                  const existing = (selectedReview.attributeRatings || []).find(r => String(r.attributeId) === String(attr.id) && String(r.ratedByRole) === String(roleKey));
                                  return existing ? existing.rating : "-";
                                };

                                return (
                                  <tr key={attr.id}>
                                    <td><strong>{attr.attributeName}</strong></td>
                                    <td style={{ fontSize: "13px", color: "#666" }}>{attr.description}</td>
                                    <td>
                                      {canEdit && isRo ? (
                                        <select
                                          value={current.rating}
                                          onChange={(e) => setSelectedReviewAttributeInputs(prev => ({
                                            ...prev,
                                            [attr.id]: { ...prev[attr.id], rating: e.target.value }
                                          }))}
                                        >
                                          <option value="">Select</option>
                                          {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
                                        </select>
                                      ) : getRoleRating(ROLES.REPORTING_OFFICER)}
                                    </td>
                                    <td>
                                      {canEdit && isRevo ? (
                                        <select
                                          value={current.rating}
                                          onChange={(e) => setSelectedReviewAttributeInputs(prev => ({
                                            ...prev,
                                            [attr.id]: { ...prev[attr.id], rating: e.target.value }
                                          }))}
                                        >
                                          <option value="">Select</option>
                                          {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
                                        </select>
                                      ) : getRoleRating(ROLES.REVIEWING_OFFICER)}
                                    </td>
                                    <td>
                                      {canEdit && isAo ? (
                                        <select
                                          value={current.rating}
                                          onChange={(e) => setSelectedReviewAttributeInputs(prev => ({
                                            ...prev,
                                            [attr.id]: { ...prev[attr.id], rating: e.target.value }
                                          }))}
                                        >
                                          <option value="">Select</option>
                                          {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
                                        </select>
                                      ) : getRoleRating(ROLES.ACCEPTING_OFFICER)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedReviewStage && selectedReview?.canEdit && (
                  <div className="action-row" style={{ marginTop: "16px" }}>
                    <button className="btn" type="button" disabled={!selectedReviewComplete} onClick={submitSelectedReview}>
                      Submit to Next Officer
                    </button>
                  </div>
                )}
                {selectedReviewStage && selectedReview?.canEdit && !selectedReviewComplete && (
                  <div className="muted" style={{ marginTop: "10px" }}>
                    Fill a rating and remarks for every goal, and rate every quantitative attribute (1-5) before submitting.
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {error && <div className="error-text" style={{ padding: "12px 0" }}>{error}</div>}
      </div>
    </div>
  );
};

export default Reviews;
