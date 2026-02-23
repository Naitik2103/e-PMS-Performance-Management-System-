import React, { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";

const Reviews = () => {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [selfForm, setSelfForm] = useState({ year: new Date().getFullYear(), selfSummary: "" });
  const [ratingInputs, setRatingInputs] = useState({});
  const [remarkInputs, setRemarkInputs] = useState({});
  const [error, setError] = useState("");

  const loadReviews = async () => {
    try {
      if (user?.role === "Employee") {
        const response = await apiClient.get("/reviews/my");
        setReviews(response.data);
      } else {
        const response = await apiClient.get("/reviews/queue");
        setReviews(response.data);
      }
    } catch (err) {
      setReviews([]);
    }
  };

  useEffect(() => {
    if (user) {
      loadReviews();
    }
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
      const payload = ratingInputs[reviewId] || { score: 0, remarks: "" };
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
      await apiClient.post(endpoint, { reviewId, remarks });
      loadReviews();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to submit remarks");
    }
  };

  return (
    <div className="page-content">
      {user?.role === "Employee" && (
        <div className="card">
          <div className="card-header">
            <h2>Self Performance Summary</h2>
          </div>
          <div className="form-grid">
            <div>
              <label>Year</label>
              <input
                type="number"
                value={selfForm.year}
                onChange={(e) => setSelfForm({ ...selfForm, year: Number(e.target.value) })}
              />
            </div>
            <div>
              <label>Summary</label>
              <textarea
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

      <div className="card">
        <div className="card-header">
          <h2>Reviews</h2>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Year</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((review) => (
              <tr key={review._id}>
                <td>{review.employee?.name || "Self"}</td>
                <td>{review.year}</td>
                <td><StatusBadge status={review.status} /></td>
                <td>
                  {user?.role === "ReportingOfficer" && (
                    <div className="inline-form">
                      <input
                        type="number"
                        placeholder="Score"
                        value={ratingInputs[review._id]?.score || ""}
                        onChange={(e) =>
                          setRatingInputs((prev) => ({
                            ...prev,
                            [review._id]: { ...prev[review._id], score: e.target.value }
                          }))
                        }
                      />
                      <input
                        placeholder="Remarks"
                        value={ratingInputs[review._id]?.remarks || ""}
                        onChange={(e) =>
                          setRatingInputs((prev) => ({
                            ...prev,
                            [review._id]: { ...prev[review._id], remarks: e.target.value }
                          }))
                        }
                      />
                      <button className="btn" type="button" onClick={() => submitRating(review._id)}>
                        Submit
                      </button>
                    </div>
                  )}
                  {user?.role === "ReviewingOfficer" && (
                    <div className="inline-form-short">
                      <input
                        placeholder="Remarks"
                        value={remarkInputs[review._id] || ""}
                        onChange={(e) => setRemarkInputs((prev) => ({ ...prev, [review._id]: e.target.value }))}
                      />
                      <button className="btn" type="button" onClick={() => submitRemarks(review._id, "/reviews/review-approve")}>
                        Approve
                      </button>
                    </div>
                  )}
                  {user?.role === "AcceptingOfficer" && (
                    <div className="inline-form-short">
                      <input
                        placeholder="Final remarks"
                        value={remarkInputs[review._id] || ""}
                        onChange={(e) => setRemarkInputs((prev) => ({ ...prev, [review._id]: e.target.value }))}
                      />
                      <button className="btn" type="button" onClick={() => submitRemarks(review._id, "/reviews/accept")}>
                        Accept
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {error && <div className="error-text">{error}</div>}
      </div>
    </div>
  );
};

export default Reviews;
