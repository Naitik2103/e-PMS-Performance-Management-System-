import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Select from "react-select";
import { apiClient } from "../../api/client";
import { formatDateDisplay } from "../../utils/dateFormat";
import { useToast } from "../../hooks/useToast";

const selectStyles = (hasValue) => ({
  control: (base) => ({
    ...base,
    minHeight: 36,
    borderColor: hasValue ? "#378ADD" : base.borderColor,
    backgroundColor: hasValue ? "#E6F1FB" : base.backgroundColor,
    color: hasValue ? "#185FA5" : base.color
  }),
  singleValue: (base) => ({
    ...base,
    color: hasValue ? "#185FA5" : base.color
  })
});

const ManageParticipantsPage = () => {
  const { cycleId } = useParams();
  const queryClient = useQueryClient();
  const { toast, showToast } = useToast();
  const [localParticipants, setLocalParticipants] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serverErrors, setServerErrors] = useState([]);
  const [confirmActivate, setConfirmActivate] = useState(false);

  const { data: participants = [] } = useQuery({
    queryKey: ["participants", cycleId],
    queryFn: async () => {
      const res = await apiClient.get(`/admin/cycles/${cycleId}/participants`);
      return res.data;
    },
    enabled: Boolean(cycleId)
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["allUsers"],
    queryFn: async () => {
      const res = await apiClient.get("/admin/users/all");
      return res.data;
    }
  });

  const { data: cycles = [] } = useQuery({
    queryKey: ["admin", "cycles"],
    queryFn: async () => {
      const res = await apiClient.get("/admin/cycles");
      return res.data;
    }
  });

  const cycle = cycles.find((c) => c.id === cycleId);

  useEffect(() => {
    if (participants) setLocalParticipants(participants);
  }, [participants]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const stats = useMemo(
    () => ({
      total: localParticipants.length,
      fullyAssigned: localParticipants.filter(
        (p) => p.reportingOfficerId && p.reviewingOfficerId && p.acceptingOfficerId
      ).length,
      partial: localParticipants.filter(
        (p) =>
          (p.reportingOfficerId || p.reviewingOfficerId || p.acceptingOfficerId) &&
          !(p.reportingOfficerId && p.reviewingOfficerId && p.acceptingOfficerId)
      ).length,
      notAssigned: localParticipants.filter(
        (p) => !p.reportingOfficerId && !p.reviewingOfficerId && !p.acceptingOfficerId
      ).length
    }),
    [localParticipants]
  );

  const percentage = stats.total ? Math.round((stats.fullyAssigned / stats.total) * 100) : 0;

  const conflicts = useMemo(() => {
    const found = [];
    for (const p of localParticipants) {
      if (p.reportingOfficerId && p.reportingOfficerId === p.reviewingOfficerId) {
        found.push(`${p.employeeName}: same person is both RO and RevO`);
      }
      if (p.reportingOfficerId && p.reportingOfficerId === p.acceptingOfficerId) {
        found.push(`${p.employeeName}: same person is both RO and AO`);
      }
      if (p.reviewingOfficerId && p.reviewingOfficerId === p.acceptingOfficerId) {
        found.push(`${p.employeeName}: same person is both RevO and AO`);
      }
    }
    return found;
  }, [localParticipants]);

  const filtered = useMemo(() => {
    return localParticipants
      .filter((p) => (p.employeeName || "").toLowerCase().includes(search.toLowerCase()))
      .filter((p) => statusFilter === "all" || p.assignmentStatus === statusFilter);
  }, [localParticipants, search, statusFilter]);

  const officerOptionsForRow = (employeeId) =>
    allUsers
      .filter((u) => u.id !== employeeId)
      .map((u) => ({
        value: u.id,
        label: `${u.fullName} — ${u.department || ""}`
      }));

  const handleOfficerChange = (participantId, field, value) => {
    setLocalParticipants((prev) =>
      prev.map((p) => {
        if (p.participantId !== participantId) return p;
        const next = { ...p, [field]: value || null };
        const ro = field === "reportingOfficerId" ? value || null : p.reportingOfficerId;
        const revo = field === "reviewingOfficerId" ? value || null : p.reviewingOfficerId;
        const ao = field === "acceptingOfficerId" ? value || null : p.acceptingOfficerId;
        next.assignmentStatus =
          ro && revo && ao ? "complete" : ro || revo || ao ? "partial" : "empty";
        return next;
      })
    );
    setIsDirty(true);
    setServerErrors([]);
  };

  const handleAutoFill = () => {
    setLocalParticipants((prev) =>
      prev.map((p) => {
        const user = allUsers.find((u) => u.id === p.employeeId);
        return user?.reportingTo ? { ...p, reportingOfficerId: user.reportingTo } : p;
      })
    );
    setIsDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.put(`/admin/cycles/${cycleId}/participants`, {
        participants: localParticipants.map((p) => ({
          participantId: p.participantId,
          employeeId: p.employeeId,
          reportingOfficerId: p.reportingOfficerId,
          reviewingOfficerId: p.reviewingOfficerId,
          acceptingOfficerId: p.acceptingOfficerId
        }))
      }),
    onSuccess: () => {
      showToast("Assignments saved successfully");
      setIsDirty(false);
      setServerErrors([]);
      queryClient.invalidateQueries({ queryKey: ["participants", cycleId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "cycles"] });
    },
    onError: (err) => {
      const d = err.response?.data;
      if (err.response?.status === 422 && Array.isArray(d?.errors)) {
        setServerErrors(d.errors);
      } else {
        showToast(d?.error || "Save failed", "error");
      }
    }
  });

  const activateMutation = useMutation({
    mutationFn: () => apiClient.put(`/admin/cycles/${cycleId}/activate`),
    onSuccess: () => {
      showToast("Cycle activated successfully");
      setConfirmActivate(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "cycles"] });
    },
    onError: (err) => {
      const d = err.response?.data;
      if (err.response?.status === 422 && d?.incomplete) {
        setServerErrors([d.error, ...(d.incomplete || []).map((n) => `— ${n}`)]);
      } else {
        showToast(d?.error || "Activation failed", "error");
      }
    }
  });

  const initials = (name) =>
    (name || "?")
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  const goalStart = cycle?.goalSettingStart;

  return (
    <div className="manage-participants-page">
      {toast && (
        <div className={`app-toast app-toast--${toast.variant}`} role="status">
          {toast.message}
        </div>
      )}
      <nav className="admin-breadcrumb muted small">
        <Link to="/admin/cycles">Admin</Link>
        {" > "}
        <Link to="/admin/cycles">Appraisal Cycles</Link>
        {" > "}
        <span>{cycle?.financialYear || cycle?.cycle_year || cycleId}</span>
        {" > "}
        <span>Manage Participants</span>
      </nav>

      <div className="admin-mp-header">
        <div>
          <h2>
            {cycle?.cycleName || "Cycle"}{" "}
            <span className={`cycle-badge cycle-badge--${cycle?.status || "draft"}`}>{cycle?.status || "…"}</span>
          </h2>
        </div>
        <div className="action-row">
          <button type="button" className="btn ghost" onClick={handleAutoFill}>
            Auto-fill from org chart
          </button>
          <button
            type="button"
            className="btn"
            disabled={conflicts.length > 0 || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Save assignments
          </button>
        </div>
      </div>

      <div className="admin-stat-grid">
        <div className="admin-stat-card">
          <div className="muted small">Total employees</div>
          <div className="admin-stat-num">{stats.total}</div>
        </div>
        <div className="admin-stat-card">
          <div className="muted small">Fully assigned</div>
          <div className="admin-stat-num stat-ok">{stats.fullyAssigned}</div>
        </div>
        <div className="admin-stat-card">
          <div className="muted small">Partially assigned</div>
          <div className="admin-stat-num stat-warn">{stats.partial}</div>
        </div>
        <div className="admin-stat-card">
          <div className="muted small">Not assigned</div>
          <div className="admin-stat-num stat-bad">{stats.notAssigned}</div>
        </div>
      </div>

      <div className="admin-mp-progress">
        <div className="admin-cycle-progress-wrap">
          <div className="admin-cycle-progress" style={{ width: `${percentage}%` }} />
        </div>
        <span className="muted small">
          {stats.fullyAssigned} / {stats.total} complete
        </span>
      </div>

      <div className="admin-mp-controls">
        <input
          className="admin-mp-search"
          placeholder="Search by employee name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="complete">Fully assigned</option>
          <option value="partial">Partial</option>
          <option value="empty">Not assigned</option>
        </select>
      </div>

      {(conflicts.length > 0 || serverErrors.length > 0) && (
        <div className="admin-conflict-banner">
          {[...conflicts, ...serverErrors].map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
        </div>
      )}

      <div className="table-wrap admin-mp-table-wrap">
        <table className="table admin-mp-table">
          <thead>
            <tr>
              <th style={{ width: 200 }}>Employee</th>
              <th style={{ width: 200 }}>Reporting Officer</th>
              <th style={{ width: 200 }}>Reviewing Officer</th>
              <th style={{ width: 200 }}>Accepting Officer</th>
              <th style={{ width: 90 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.participantId}>
                <td>
                  <div className="admin-mp-emp">
                    <span className="admin-mp-avatar">{initials(p.employeeName)}</span>
                    <div>
                      <div>{p.employeeName}</div>
                      <div className="muted small">{p.department}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <Select
                    styles={selectStyles(Boolean(p.reportingOfficerId))}
                    isClearable
                    placeholder="— Select —"
                    options={officerOptionsForRow(p.employeeId)}
                    value={
                      officerOptionsForRow(p.employeeId).find((o) => o.value === p.reportingOfficerId) || null
                    }
                    onChange={(opt) =>
                      handleOfficerChange(p.participantId, "reportingOfficerId", opt?.value)
                    }
                  />
                </td>
                <td>
                  <Select
                    styles={selectStyles(Boolean(p.reviewingOfficerId))}
                    isClearable
                    placeholder="— Select —"
                    options={officerOptionsForRow(p.employeeId)}
                    value={
                      officerOptionsForRow(p.employeeId).find((o) => o.value === p.reviewingOfficerId) || null
                    }
                    onChange={(opt) =>
                      handleOfficerChange(p.participantId, "reviewingOfficerId", opt?.value)
                    }
                  />
                </td>
                <td>
                  <Select
                    styles={selectStyles(Boolean(p.acceptingOfficerId))}
                    isClearable
                    placeholder="— Select —"
                    options={officerOptionsForRow(p.employeeId)}
                    value={
                      officerOptionsForRow(p.employeeId).find((o) => o.value === p.acceptingOfficerId) || null
                    }
                    onChange={(opt) =>
                      handleOfficerChange(p.participantId, "acceptingOfficerId", opt?.value)
                    }
                  />
                </td>
                <td>
                  <span className={`mp-status mp-status--${p.assignmentStatus}`}>{p.assignmentStatus}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cycle?.status === "draft" && (
        <div className="admin-mp-footer">
          <span
            title={
              stats.fullyAssigned < stats.total
                ? `${stats.total - stats.fullyAssigned} employees still have incomplete assignments`
                : ""
            }
          >
            <button
              type="button"
              className="btn secondary"
              disabled={stats.fullyAssigned < stats.total || activateMutation.isPending}
              onClick={() => setConfirmActivate(true)}
            >
              Activate cycle
            </button>
          </span>
        </div>
      )}

      {confirmActivate && (
        <div className="modal-backdrop" role="presentation" onClick={() => setConfirmActivate(false)}>
          <div className="modal-panel" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Activate cycle?</h3>
            <p>
              Once activated, participant assignments cannot be changed. All employees will be notified and the
              goal-setting window will open on {formatDateDisplay(goalStart)}. Proceed?
            </p>
            <div className="action-row">
              <button type="button" className="btn ghost" onClick={() => setConfirmActivate(false)}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={() => activateMutation.mutate()}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageParticipantsPage;
