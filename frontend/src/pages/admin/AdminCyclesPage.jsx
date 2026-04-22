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
  const [editingCycleId, setEditingCycleId] = useState(null);
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

  const updateMutation = useMutation({
    mutationFn: (body) => apiClient.put(`/admin/cycles/${editingCycleId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "cycles"] });
      showToast("Cycle updated");
      setModalOpen(false);
      setEditingCycleId(null);
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
      showToast(err.response?.data?.error || "Could not update cycle", "error");
    }
  });

  const openModal = () => {
    const y = new Date().getFullYear();
    setForm({
      cycleName: `Annual Appraisal ${y}-${String(y + 1).slice(-2)}`,
      financialYear: `${y}-${String(y + 1).slice(-2)}`,
      goalSettingStart: `${y}-04-01`,
      goalSettingEnd: `${y}-04-30`,
      sixMonthReviewStart: `${y}-10-01`,
      sixMonthReviewEnd: `${y}-10-31`,
      annualAppraisalStart: `${y + 1}-02-01`,
      annualAppraisalEnd: `${y + 1}-03-31`
    });
    setEditingCycleId(null);
    setModalOpen(true);
  };

  const openEditModal = (cycle) => {
    setEditingCycleId(cycle.id);
    setForm({
      cycleName: cycle.cycleName || cycle.name,
      financialYear: cycle.financialYear || cycle.year,
      goalSettingStart: cycle.goalSettingStart,
      goalSettingEnd: cycle.goalSettingEnd,
      sixMonthReviewStart: cycle.sixMonthReviewStart || cycle.sixMonthProgressReviewStart,
      sixMonthReviewEnd: cycle.sixMonthReviewEnd || cycle.sixMonthProgressReviewEnd,
      annualAppraisalStart: cycle.annualAppraisalStart,
      annualAppraisalEnd: cycle.annualAppraisalEnd
    });
    setModalOpen(true);
  };

  const submit = () => {
    if (!form.cycleName?.trim() || !form.financialYear?.trim()) {
      showToast("Cycle name and financial year are required", "error");
      return;
    }
    const payload = {
      cycleName: form.cycleName.trim(),
      financialYear: form.financialYear.trim(),
      goalSettingStart: form.goalSettingStart || null,
      goalSettingEnd: form.goalSettingEnd || null,
      sixMonthReviewStart: form.sixMonthReviewStart || null,
      sixMonthReviewEnd: form.sixMonthReviewEnd || null,
      annualAppraisalStart: form.annualAppraisalStart || null,
      annualAppraisalEnd: form.annualAppraisalEnd || null
    };

    if (editingCycleId) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
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
              className={`card admin-cycle-card-new${isActiveCard ? " active" : ""}`}
            >
              <div className="admin-cycle-card-body">
                <div className="admin-cycle-card-top">
                  <div className="admin-cycle-info">
                    <h3 className="admin-cycle-name">{c.cycleName || c.name}</h3>
                    <div className="admin-cycle-dates">{dateSummary}</div>
                  </div>
                  <span className={`admin-cycle-status ${c.status || "draft"}`}>
                    {(c.status || "draft").charAt(0).toUpperCase() + (c.status || "draft").slice(1)}
                  </span>
                </div>

                <div className="admin-cycle-stats-grid">
                  <div className="admin-cycle-stat-item">
                    <div className="stat-value total">{stats.total}</div>
                    <div className="stat-label">total</div>
                  </div>
                  <div className="admin-cycle-stat-item">
                    <div className="stat-value full">{stats.fullyAssigned}</div>
                    <div className="stat-label">full</div>
                  </div>
                  <div className="admin-cycle-stat-item">
                    <div className="stat-value partial">{stats.partial}</div>
                    <div className="stat-label">partial</div>
                  </div>
                  <div className="admin-cycle-stat-item">
                    <div className="stat-value none">{stats.notAssigned}</div>
                    <div className="stat-label">none</div>
                  </div>
                </div>

                <div className="admin-cycle-progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>

                <div className="admin-cycle-footer-actions">
                  <Link className="admin-btn-outline" to={`/admin/cycles/${c.id}/participants`}>
                    Manage participants →
                  </Link>
                  <button type="button" className="admin-btn-outline" onClick={() => openEditModal(c)}>
                    Edit dates
                  </button>
                  {c.status === "draft" && (
                    <span
                      title={hasOtherActive(c.id) ? "Another cycle is already active" : ""}
                    >
                      <button
                        type="button"
                        className="admin-btn-outline primary"
                        disabled={hasOtherActive(c.id) || activateMutation.isPending}
                        onClick={() => activateMutation.mutate(c.id)}
                      >
                        Activate
                      </button>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalOpen(false)}>
          <div className="modal-panel" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{editingCycleId ? "Edit appraisal cycle" : "New appraisal cycle"}</h3>
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
              <button type="button" className="btn" onClick={submit} disabled={createMutation.isPending || updateMutation.isPending}>
                {editingCycleId ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCyclesPage;
