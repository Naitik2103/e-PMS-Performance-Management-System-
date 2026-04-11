import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { formatDateDisplay, toInputDate } from "../../utils/dateFormat";
import { useToast } from "../../hooks/useToast";

const statusBadgeClass = (status) => {
  if (status === "active") return "cycle-badge cycle-badge--active";
  if (status === "closed") return "cycle-badge cycle-badge--closed";
  return "cycle-badge cycle-badge--draft";
};

const AdminCyclesPage = () => {
  const queryClient = useQueryClient();
  const { toast, showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    cycleName: "",
    financialYear: "",
    goalSettingStart: "",
    goalSettingEnd: "",
    sixMonthReviewStart: "",
    sixMonthReviewEnd: "",
    annualAppraisalStart: "",
    annualAppraisalEnd: ""
  });

  const { data: cycles = [], isLoading } = useQuery({
    queryKey: ["admin", "cycles"],
    queryFn: async () => {
      const res = await apiClient.get("/admin/cycles");
      return res.data;
    }
  });

  const hasOtherActive = (cycleId) => cycles.some((c) => c.id !== cycleId && c.status === "active");

  const activateMutation = useMutation({
    mutationFn: (cycleId) => apiClient.put(`/admin/cycles/${cycleId}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "cycles"] });
      showToast("Cycle activated successfully");
    },
    onError: (err) => {
      const d = err.response?.data;
      showToast(d?.error || "Could not activate cycle", "error");
    }
  });

  const createMutation = useMutation({
    mutationFn: (body) => apiClient.post("/admin/cycles", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "cycles"] });
      showToast("Cycle created");
      setModalOpen(false);
      setForm({
        cycleName: "",
        financialYear: "",
        goalSettingStart: "",
        goalSettingEnd: "",
        sixMonthReviewStart: "",
        sixMonthReviewEnd: "",
        annualAppraisalStart: "",
        annualAppraisalEnd: ""
      });
    },
    onError: (err) => {
      showToast(err.response?.data?.error || "Could not create cycle", "error");
    }
  });

  const openModal = () => {
    const y = new Date().getFullYear();
    setForm((f) => ({
      ...f,
      cycleName: f.cycleName || `Annual Appraisal ${y}-${String(y + 1).slice(-2)}`,
      financialYear: f.financialYear || `${y}-${String(y + 1).slice(-2)}`,
      goalSettingStart: f.goalSettingStart || `${y}-04-01`,
      goalSettingEnd: f.goalSettingEnd || `${y}-04-30`,
      sixMonthReviewStart: f.sixMonthReviewStart || `${y}-10-01`,
      sixMonthReviewEnd: f.sixMonthReviewEnd || `${y}-10-31`,
      annualAppraisalStart: f.annualAppraisalStart || `${y + 1}-02-01`,
      annualAppraisalEnd: f.annualAppraisalEnd || `${y + 1}-03-31`
    }));
    setModalOpen(true);
  };

  const submit = () => {
    if (!form.cycleName?.trim() || !form.financialYear?.trim()) {
      showToast("Cycle name and financial year are required", "error");
      return;
    }
    createMutation.mutate({
      cycleName: form.cycleName.trim(),
      financialYear: form.financialYear.trim(),
      goalSettingStart: form.goalSettingStart || null,
      goalSettingEnd: form.goalSettingEnd || null,
      sixMonthReviewStart: form.sixMonthReviewStart || null,
      sixMonthReviewEnd: form.sixMonthReviewEnd || null,
      annualAppraisalStart: form.annualAppraisalStart || null,
      annualAppraisalEnd: form.annualAppraisalEnd || null
    });
  };

  return (
    <div className="admin-cycles-page">
      {toast && (
        <div className={`app-toast app-toast--${toast.variant}`} role="status">
          {toast.message}
        </div>
      )}
      <div className="admin-cycles-header">
        <h2>Appraisal cycles</h2>
        <button type="button" className="btn" onClick={openModal}>
          New cycle
        </button>
      </div>

      {isLoading && <p className="muted">Loading cycles…</p>}

      <div className="admin-cycle-cards">
        {cycles.map((c) => {
          const stats = c.participantStats || { total: 0, fullyAssigned: 0, partial: 0, notAssigned: 0 };
          const pct = stats.total ? Math.round((stats.fullyAssigned / stats.total) * 100) : 0;
          const isActiveCard = c.status === "active";
          const dateSummary = [
            formatDateDisplay(c.goalSettingStart),
            formatDateDisplay(c.goalSettingEnd),
            formatDateDisplay(c.sixMonthReviewStart || c.sixMonthProgressReviewStart),
            formatDateDisplay(c.annualAppraisalStart)
          ]
            .filter(Boolean)
            .slice(0, 4)
            .join(" · ");

          return (
            <div
              key={c.id}
              className={`card admin-cycle-card${isActiveCard ? " admin-cycle-card--active" : ""}`}
              style={isActiveCard ? { border: "1.5px solid #1D9E75" } : undefined}
            >
              <div className="admin-cycle-card-head">
                <div>
                  <div className="admin-cycle-title">{c.cycleName || c.name}</div>
                  <div className="muted small">{dateSummary}</div>
                </div>
                <span className={statusBadgeClass(c.status)}>{c.status || "draft"}</span>
              </div>
              <div className="admin-cycle-stats">
                <span title="Total">{stats.total} total</span>
                <span className="stat-ok">{stats.fullyAssigned} full</span>
                <span className="stat-warn">{stats.partial} partial</span>
                <span className="stat-bad">{stats.notAssigned} none</span>
              </div>
              <div className="admin-cycle-progress-wrap">
                <div className="admin-cycle-progress" style={{ width: `${pct}%` }} />
              </div>
              <div className="admin-cycle-actions">
                <Link className="btn ghost" to={`/admin/cycles/${c.id}/participants`}>
                  Manage participants →
                </Link>
                {c.status === "draft" && (
                  <span
                    className="admin-activate-wrap"
                    title={hasOtherActive(c.id) ? "Another cycle is already active" : ""}
                  >
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={hasOtherActive(c.id) || activateMutation.isPending}
                      onClick={() => activateMutation.mutate(c.id)}
                    >
                      Activate
                    </button>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalOpen(false)}>
          <div className="modal-panel" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>New appraisal cycle</h3>
            <div className="form-grid">
              <div className="form-row">
                <div>
                  <label>Cycle name</label>
                  <input value={form.cycleName} onChange={(e) => setForm({ ...form, cycleName: e.target.value })} />
                </div>
                <div>
                  <label>Financial year</label>
                  <input
                    placeholder="2024-25"
                    value={form.financialYear}
                    onChange={(e) => setForm({ ...form, financialYear: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-row">
                <div>
                  <label>Goal setting start</label>
                  <input
                    type="date"
                    value={toInputDate(form.goalSettingStart)}
                    onChange={(e) => setForm({ ...form, goalSettingStart: e.target.value })}
                  />
                </div>
                <div>
                  <label>Goal setting end</label>
                  <input
                    type="date"
                    value={toInputDate(form.goalSettingEnd)}
                    onChange={(e) => setForm({ ...form, goalSettingEnd: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-row">
                <div>
                  <label>Six-month review start</label>
                  <input
                    type="date"
                    value={toInputDate(form.sixMonthReviewStart)}
                    onChange={(e) => setForm({ ...form, sixMonthReviewStart: e.target.value })}
                  />
                </div>
                <div>
                  <label>Six-month review end</label>
                  <input
                    type="date"
                    value={toInputDate(form.sixMonthReviewEnd)}
                    onChange={(e) => setForm({ ...form, sixMonthReviewEnd: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-row">
                <div>
                  <label>Annual appraisal start</label>
                  <input
                    type="date"
                    value={toInputDate(form.annualAppraisalStart)}
                    onChange={(e) => setForm({ ...form, annualAppraisalStart: e.target.value })}
                  />
                </div>
                <div>
                  <label>Annual appraisal end</label>
                  <input
                    type="date"
                    value={toInputDate(form.annualAppraisalEnd)}
                    onChange={(e) => setForm({ ...form, annualAppraisalEnd: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="action-row">
              <button type="button" className="btn ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={submit} disabled={createMutation.isPending}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCyclesPage;
