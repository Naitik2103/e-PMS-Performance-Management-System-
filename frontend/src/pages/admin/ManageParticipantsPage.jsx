import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Select from "react-select";
import { apiClient } from "../../api/client";
import { formatDateDisplay } from "../../utils/dateFormat";
import { useToast } from "../../hooks/useToast";
import {
  getValidAOOptions,
  getValidRevOOptions,
  getValidROOptions,
  onSelectionChange,
  validateAssignmentsHard
} from "../../utils/participantAlgorithm";

const selectStyles = ({ hasValue, isSuggested }) => ({
  control: (base) => ({
    ...base,
    minHeight: 36,
    borderColor: hasValue ? "#378ADD" : base.borderColor,
    backgroundColor: isSuggested ? "#E8F2FC" : hasValue ? "#E6F1FB" : base.backgroundColor,
    color: hasValue ? "#185FA5" : base.color
  }),
  singleValue: (base) => ({
    ...base,
    color: hasValue ? "#185FA5" : base.color
  })
});

const asOpt = (u) => ({ value: u.id, label: u.name });
const initials = (name) =>
  (name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const ManageParticipantsPage = () => {
  const { cycleId } = useParams();
  const queryClient = useQueryClient();
  const { toast, showToast } = useToast();

  const [localParticipants, setLocalParticipants] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serverErrors, setServerErrors] = useState([]);
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [rowUi, setRowUi] = useState(() => ({})); // { [employee_id]: { suggestions, warnings } }

  const { data: allUsers = [] } = useQuery({
    queryKey: ["usersWithLevels"],
    queryFn: async () => {
      const res = await apiClient.get("/users/with-levels");
      return res.data;
    }
  });

  const usersById = useMemo(() => {
    const map = new Map();
    for (const u of allUsers) map.set(String(u.id), u);
    return map;
  }, [allUsers]);

  const { data: participants = [] } = useQuery({
    queryKey: ["participantsHybrid", cycleId],
    queryFn: async () => {
      const res = await apiClient.get(`/appraisal-cycles/${cycleId}/participants`);
      return res.data;
    },
    enabled: Boolean(cycleId)
  });

  // Keep cycle metadata coming from the existing admin API (header + activate copy).
  const { data: cycle } = useQuery({
    queryKey: ["cycleMeta", cycleId],
    queryFn: async () => {
      const res = await apiClient.get(`/admin/cycles/${cycleId}/participants?includeCycle=1`);
      return res.data?.cycle || null;
    },
    enabled: Boolean(cycleId)
  });

  useEffect(() => {
    if (participants) setLocalParticipants(participants);
  }, [participants]);

  const stats = useMemo(
    () => ({
      total: localParticipants.length,
      fullyAssigned: localParticipants.filter((p) => p.ro_id && p.revo_id && p.ao_id).length,
      partial: localParticipants.filter((p) => (p.ro_id || p.revo_id || p.ao_id) && !(p.ro_id && p.revo_id && p.ao_id))
        .length,
      notAssigned: localParticipants.filter((p) => !p.ro_id && !p.revo_id && !p.ao_id).length
    }),
    [localParticipants]
  );

  const percentage = stats.total ? Math.round((stats.fullyAssigned / stats.total) * 100) : 0;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return localParticipants.filter((p) => {
      const name = usersById.get(String(p.employee_id))?.name || p.employee_id;
      const matchesSearch = name.toLowerCase().includes(q);
      const isFullyAssigned = Boolean(p.ro_id && p.revo_id && p.ao_id);
      const isNotAssigned = Boolean(!p.ro_id && !p.revo_id && !p.ao_id);
      const isPartial = !isFullyAssigned && !isNotAssigned;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "fully_assigned" && isFullyAssigned) ||
        (statusFilter === "partial" && isPartial) ||
        (statusFilter === "not_assigned" && isNotAssigned);

      return matchesSearch && matchesStatus;
    });
  }, [localParticipants, search, statusFilter, usersById]);

  const baselineByEmployeeId = useMemo(() => {
    const map = new Map();
    for (const p of participants || []) {
      map.set(String(p.employee_id), {
        ro_id: p.ro_id || null,
        revo_id: p.revo_id || null,
        ao_id: p.ao_id || null
      });
    }
    return map;
  }, [participants]);

  const dirtyParticipants = useMemo(
    () =>
      localParticipants.filter((p) => {
        const key = String(p.employee_id);
        const base = baselineByEmployeeId.get(key);
        const curr = { ro_id: p.ro_id || null, revo_id: p.revo_id || null, ao_id: p.ao_id || null };
        if (!base) return true;
        return base.ro_id !== curr.ro_id || base.revo_id !== curr.revo_id || base.ao_id !== curr.ao_id;
      }),
    [baselineByEmployeeId, localParticipants]
  );

  const hasAnyHardErrors = useMemo(
    () =>
      localParticipants.some((p) => {
        const hard = validateAssignmentsHard(
          String(p.employee_id),
          { ro_id: p.ro_id || null, revo_id: p.revo_id || null, ao_id: p.ao_id || null },
          localParticipants
        );
        return hard.errors.length > 0;
      }),
    [localParticipants]
  );

  const saveAllMutation = useMutation({
    mutationFn: async () => {
      for (const p of dirtyParticipants) {
        const employeeId = String(p.employee_id);
        await apiClient.put(`/appraisal-cycles/${cycleId}/participants/${employeeId}`, {
          ro_id: p.ro_id || null,
          revo_id: p.revo_id || null,
          ao_id: p.ao_id || null
        });
      }
    },
    onSuccess: (data) => {
      if (dirtyParticipants.length > 0) {
        showToast(`Saved ${dirtyParticipants.length} changed row(s)`, "success");
      } else {
        showToast("No changes to save");
      }
      setServerErrors([]);
      queryClient.invalidateQueries({ queryKey: ["participantsHybrid", cycleId] });
    },
    onError: (err) => {
      const d = err.response?.data;
      if (err.response?.status === 422 && Array.isArray(d?.errors)) {
        showToast(d.errors[0] || "One or more rows have errors", "error");
      } else {
        showToast(d?.error || "Save all failed", "error");
      }
    }
  });

  const activateMutation = useMutation({
    mutationFn: () => apiClient.put(`/admin/cycles/${cycleId}/activate`),
    onSuccess: () => {
      showToast("Cycle activated successfully");
      setConfirmActivate(false);
      queryClient.invalidateQueries({ queryKey: ["participantsHybrid", cycleId] });
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

  const handleChange = (employeeId, field, newValue) => {
    const row = localParticipants.find((p) => String(p.employee_id) === String(employeeId));
    const current = row || { employee_id: employeeId, ro_id: null, revo_id: null, ao_id: null };

    const next = onSelectionChange(
      employeeId,
      field,
      newValue,
      allUsers,
      localParticipants,
      { ro_id: current.ro_id, revo_id: current.revo_id, ao_id: current.ao_id }
    );

    setLocalParticipants((prev) =>
      prev.map((p) => (String(p.employee_id) === String(employeeId) ? { ...p, ...next.updatedAssignments } : p))
    );

    setRowUi((prev) => ({
      ...prev,
      [String(employeeId)]: {
        suggestions: next.suggestions,
        warnings: next.warnings,
        hardErrors: next.hardErrors
      }
    }));
  };

  const computeRowOptions = (employeeId, assignments) => {
    const roOptions = getValidROOptions(employeeId, allUsers, localParticipants).map(asOpt);
    const revo = getValidRevOOptions(employeeId, assignments.ro_id, allUsers, localParticipants);
    const ao = getValidAOOptions(employeeId, assignments.ro_id, assignments.revo_id, allUsers, localParticipants);
    return {
      ro: roOptions,
      revo: revo.options.map(asOpt),
      ao: ao.options.map(asOpt),
      suggestions: { revo: revo.suggestion, ao: ao.suggestion },
      warningText: { revo: revo.warningIfOverridden, ao: ao.warningIfOverridden }
    };
  };

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
        <div className="admin-mp-control-group admin-mp-control-group--search">
          <label className="admin-mp-control-label" htmlFor="mp-search">
            Search employees
          </label>
          <input
            id="mp-search"
            className="admin-mp-search"
            placeholder="Search by employee name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="admin-mp-control-group admin-mp-control-group--filter">
          <label className="admin-mp-control-label" htmlFor="mp-status-filter">
            Status filter
          </label>
          <select
            id="mp-status-filter"
            className="admin-mp-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All status</option>
            <option value="fully_assigned">Fully assigned</option>
            <option value="partial">Partial</option>
            <option value="not_assigned">Not assigned</option>
          </select>
        </div>
        <button
          type="button"
          className="btn"
          disabled={saveAllMutation.isPending || hasAnyHardErrors || dirtyParticipants.length === 0}
          onClick={() => saveAllMutation.mutate()}
        >
          Save all changes{dirtyParticipants.length > 0 ? ` (${dirtyParticipants.length})` : ""}
        </button>
      </div>

      {serverErrors.length > 0 && (
        <div className="admin-conflict-banner">
          {serverErrors.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
        </div>
      )}

      <div className="table-wrap admin-mp-table-wrap">
        <table className="table admin-mp-table">
          <thead>
            <tr>
              <th style={{ width: 220 }}>Employee</th>
              <th style={{ width: 220 }}>Reporting Officer</th>
              <th style={{ width: 220 }}>Reviewing Officer</th>
              <th style={{ width: 220 }}>Accepting Officer</th>
              <th style={{ width: 160 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const employeeId = String(p.employee_id);
              const employee = usersById.get(employeeId);
              const empName = employee?.name || employeeId;
              const empLevel = Number(employee?.org_level ?? 1);

              const assignments = { ro_id: p.ro_id || null, revo_id: p.revo_id || null, ao_id: p.ao_id || null };
              const computed = computeRowOptions(employeeId, assignments);
              const ui = rowUi[employeeId] || {};
              const suggestions = ui.suggestions || computed.suggestions || { revo: null, ao: null };
              const warnings = ui.warnings || { revo: null, ao: null };

              const hard = validateAssignmentsHard(employeeId, assignments, localParticipants);
              const hardErrors = (ui.hardErrors && ui.hardErrors.length ? ui.hardErrors : hard.errors) || [];

              const roOpts = computed.ro;
              const revoOpts = computed.revo;
              const aoOpts = computed.ao;

              const isSuggestedRevO = suggestions.revo && String(assignments.revo_id || "") === String(suggestions.revo);
              const isSuggestedAO = suggestions.ao && String(assignments.ao_id || "") === String(suggestions.ao);

              const noRO = roOpts.length === 0;
              const topOfHierarchy = empLevel >= 4;

              return (
                <tr key={employeeId}>
                  <td>
                    <div className="admin-mp-emp">
                      <span className="admin-mp-avatar">{initials(empName)}</span>
                      <div>
                        <div>{empName}</div>
                        <div className="muted small">Org level {empLevel}</div>
                      </div>
                    </div>
                  </td>

                  <td>
                    <div className="admin-mp-field-stack">
                      <Select
                        styles={selectStyles({ hasValue: Boolean(assignments.ro_id), isSuggested: false })}
                        isClearable
                        placeholder="— Select —"
                        options={roOpts}
                        value={roOpts.find((o) => o.value === assignments.ro_id) || null}
                        onChange={(opt) => handleChange(employeeId, "ro", opt?.value || null)}
                      />
                      <div className="admin-mp-help-slot">
                        {topOfHierarchy && noRO && (
                          <div className="muted small">
                            This employee is at the top of the hierarchy. RO assignment may not be required.
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  <td>
                    <div className="admin-mp-field-stack">
                      <Select
                        styles={selectStyles({ hasValue: Boolean(assignments.revo_id), isSuggested: Boolean(isSuggestedRevO) })}
                        isClearable
                        isDisabled={!assignments.ro_id}
                        placeholder={!assignments.ro_id ? "Select RO first" : "— Select —"}
                        options={revoOpts}
                        value={revoOpts.find((o) => o.value === assignments.revo_id) || null}
                        onChange={(opt) => handleChange(employeeId, "revo", opt?.value || null)}
                      />
                      <div className="admin-mp-help-slot">
                        {isSuggestedRevO && <div className="muted small">Suggested</div>}
                        {warnings?.revo && (
                          <div className="small" style={{ color: "#8a5a00" }}>
                            {warnings.revo}
                          </div>
                        )}
                        {assignments.ro_id && revoOpts.length === 0 && (
                          <div className="muted small">
                            No higher-level officer available. RevO may be left unassigned for this employee.
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  <td>
                    <div className="admin-mp-field-stack">
                      <Select
                        styles={selectStyles({ hasValue: Boolean(assignments.ao_id), isSuggested: Boolean(isSuggestedAO) })}
                        isClearable
                        isDisabled={!assignments.revo_id}
                        placeholder={!assignments.revo_id ? "Select RevO first" : "— Select —"}
                        options={aoOpts}
                        value={aoOpts.find((o) => o.value === assignments.ao_id) || null}
                        onChange={(opt) => handleChange(employeeId, "ao", opt?.value || null)}
                      />
                      <div className="admin-mp-help-slot">
                        {isSuggestedAO && <div className="muted small">Suggested</div>}
                        {warnings?.ao && (
                          <div className="small" style={{ color: "#8a5a00" }}>
                            {warnings.ao}
                          </div>
                        )}
                        {assignments.revo_id && aoOpts.length === 0 && (
                          <div className="muted small">
                            No higher-level officer available. AO may be left unassigned for this employee.
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  <td>
                    {hardErrors.length > 0 && (
                      <div className="small" style={{ color: "#b91c1c", marginBottom: 8 }}>
                        {hardErrors.map((e, idx) => (
                          <div key={idx}>{e}</div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {cycle?.status === "draft" && (
        <div className="admin-mp-footer">
          <button
            type="button"
            className="btn secondary"
            disabled={activateMutation.isPending}
            onClick={() => setConfirmActivate(true)}
          >
            Activate cycle
          </button>
        </div>
      )}

      {confirmActivate && (
        <div className="modal-backdrop" role="presentation" onClick={() => setConfirmActivate(false)}>
          <div className="modal-panel" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Activate cycle?</h3>
            <p>
              Once activated, all employees will be notified and the goal-setting window will open on{" "}
              {formatDateDisplay(goalStart)}. Proceed?
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
