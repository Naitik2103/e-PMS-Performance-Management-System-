/**
 * Hybrid participant assignment algorithm for APAR-style evaluation chains.
 *
 * This file is framework-agnostic: pure functions, no React imports.
 * It is intended to be reused (or mirrored) on the backend as a safety net.
 */

/**
 * @typedef {Object} UserWithLevels
 * @property {string} id
 * @property {string} name
 * @property {number} org_level
 * @property {string|null} reporting_to
 */

/**
 * @typedef {Object} ParticipantRow
 * @property {string} employee_id
 * @property {string|null} ro_id
 * @property {string|null} revo_id
 * @property {string|null} ao_id
 */

const asString = (v) => (v == null ? null : String(v));
const asLevel = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 1;
};

/**
 * STEP A — Build evaluates graph.
 * evaluates[X] = array of employees that X evaluates (as RO, RevO, or AO).
 *
 * @param {ParticipantRow[]} allParticipants
 * @returns {Record<string, string[]>}
 */
export function buildEvaluatesGraph(allParticipants) {
  /** @type {Map<string, Set<string>>} */
  const map = new Map();

  const add = (evaluatorId, employeeId) => {
    const eid = asString(evaluatorId);
    const tid = asString(employeeId);
    if (!eid || !tid) return;
    if (!map.has(eid)) map.set(eid, new Set());
    map.get(eid).add(tid);
  };

  for (const p of allParticipants || []) {
    if (!p) continue;
    add(p.ro_id, p.employee_id);
    add(p.revo_id, p.employee_id);
    add(p.ao_id, p.employee_id);
  }

  /** @type {Record<string, string[]>} */
  const evaluates = {};
  for (const [k, set] of map.entries()) evaluates[k] = Array.from(set);
  return evaluates;
}

/**
 * STEP B — Cycle detection (iterative DFS).
 *
 * Would assigning evaluatorId to evaluate targetEmployeeId create a cycle?
 * Logic:
 * - Start DFS at targetEmployeeId.
 * - Follow "evaluates" edges (who this node evaluates).
 * - If evaluatorId is reachable from targetEmployeeId, then adding the edge
 *   evaluatorId -> targetEmployeeId would complete a cycle.
 *
 * @param {string} evaluatorId
 * @param {string} targetEmployeeId
 * @param {Record<string, string[]>} evaluatesGraph
 * @returns {boolean}
 */
export function wouldCreateCycle(evaluatorId, targetEmployeeId, evaluatesGraph) {
  const evalId = asString(evaluatorId);
  const targetId = asString(targetEmployeeId);
  if (!evalId || !targetId) return false;

  const visited = new Set();
  const stack = [targetId];

  while (stack.length > 0) {
    const curr = asString(stack.pop());
    if (!curr) continue;
    if (curr === evalId) return true;
    if (visited.has(curr)) continue;
    visited.add(curr);
    const next = evaluatesGraph?.[curr] || [];
    for (const n of next) {
      const nid = asString(n);
      if (nid && !visited.has(nid)) stack.push(nid);
    }
  }

  return false;
}

const getUserById = (allUsers, id) => (allUsers || []).find((u) => String(u.id) === String(id));

const buildParticipantsWithOverride = (allParticipants, employeeId, patch) => {
  const eid = String(employeeId);
  let found = false;
  const out = (allParticipants || []).map((p) => {
    if (!p || String(p.employee_id) !== eid) return p;
    found = true;
    return { ...p, ...patch, employee_id: p.employee_id };
  });
  if (!found) {
    out.push({ employee_id: eid, ro_id: null, revo_id: null, ao_id: null, ...patch });
  }
  return out;
};

/**
 * STEP C — Get valid RO options.
 *
 * Rules:
 * 1) no self assignment
 * 2) org_level must be higher than employee's own org_level
 * 3) must not create a cycle
 *
 * @returns {UserWithLevels[]}
 */
export function getValidROOptions(employeeId, allUsers, allParticipants) {
  const employee = getUserById(allUsers, employeeId);
  const empLevel = asLevel(employee?.org_level);

  const graph = buildEvaluatesGraph(allParticipants);

  return (allUsers || [])
    .filter((u) => String(u.id) !== String(employeeId))
    .filter((u) => asLevel(u.org_level) > empLevel)
    .filter((u) => !wouldCreateCycle(String(u.id), String(employeeId), graph));
}

/**
 * STEP D — Get valid RevO options + suggestion + override warning.
 *
 * @returns {{ options: UserWithLevels[], suggestion: string|null, warningIfOverridden: string|null }}
 */
export function getValidRevOOptions(employeeId, selectedROId, allUsers, allParticipants) {
  const roId = asString(selectedROId);
  if (!roId) return { options: [], suggestion: null, warningIfOverridden: null };

  const ro = getUserById(allUsers, roId);
  const roLevel = asLevel(ro?.org_level);

  const graph = buildEvaluatesGraph(allParticipants);

  const options = (allUsers || [])
    .filter((u) => String(u.id) !== String(employeeId))
    // Rule relaxed: RevO CAN be the same OR higher level than RO to allow for cascading.
    .filter((u) => asLevel(u.org_level) >= roLevel)
    .filter((u) => !wouldCreateCycle(String(u.id), String(employeeId), graph));

  const roParticipant = (allParticipants || []).find((p) => String(p?.employee_id) === String(roId));
  const suggestedFromCycle = asString(roParticipant?.ro_id);
  const suggestedFromOrg = asString(ro?.reporting_to);
  const suggested = suggestedFromCycle || suggestedFromOrg;
  const suggestion =
    suggested && options.some((u) => String(u.id) === String(suggested)) ? String(suggested) : null;

  const warningIfOverridden =
    suggestion && getUserById(allUsers, suggestion)
      ? `Suggested RevO is ${getUserById(allUsers, suggestion).name} based on org chart hierarchy. Overriding may not comply with APAR norms.`
      : null;

  return { options, suggestion, warningIfOverridden };
}

/**
 * STEP E — Get valid AO options + suggestion + override warning.
 *
 * @returns {{ options: UserWithLevels[], suggestion: string|null, warningIfOverridden: string|null }}
 */
export function getValidAOOptions(employeeId, selectedROId, selectedRevOId, allUsers, allParticipants) {
  const roId = asString(selectedROId);
  const revoId = asString(selectedRevOId);
  if (!roId || !revoId) return { options: [], suggestion: null, warningIfOverridden: null };

  const revo = getUserById(allUsers, revoId);
  const revoLevel = asLevel(revo?.org_level);

  const graph = buildEvaluatesGraph(allParticipants);

  const options = (allUsers || [])
    .filter((u) => String(u.id) !== String(employeeId))
    // Rule relaxed: AO CAN be the same OR higher level than RevO to allow for cascading.
    .filter((u) => asLevel(u.org_level) >= revoLevel)
    .filter((u) => !wouldCreateCycle(String(u.id), String(employeeId), graph));

  const roParticipant = (allParticipants || []).find((p) => String(p?.employee_id) === String(roId));
  const suggestedFromCycle = asString(roParticipant?.revo_id);
  const suggestedFromOrg = asString(revo?.reporting_to);
  const suggested = suggestedFromCycle || suggestedFromOrg;
  const suggestion =
    suggested && options.some((u) => String(u.id) === String(suggested)) ? String(suggested) : null;

  const warningIfOverridden =
    suggestion && getUserById(allUsers, suggestion)
      ? `Suggested AO is ${getUserById(allUsers, suggestion).name} based on org chart hierarchy. Overriding may not comply with APAR norms.`
      : null;

  return { options, suggestion, warningIfOverridden };
}

/**
 * Basic hard-rule validation for one row (frontend-side).
 * Hard rules:
 * - no self assignment
 * - no duplicates (REMOVED)
 * - no cycles for any evaluator assignment
 *
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateAssignmentsHard(employeeId, assignments, allParticipants) {
  const eid = String(employeeId);
  const ro = asString(assignments?.ro_id);
  const revo = asString(assignments?.revo_id);
  const ao = asString(assignments?.ao_id);

  /** @type {string[]} */
  const errors = [];

  // Rule removed: RO, RevO, and AO CAN be the same person now to allow for cascading.

  if (ro && ro === eid) errors.push("RO cannot be the employee themselves.");
  if (revo && revo === eid) errors.push("RevO cannot be the employee themselves.");
  if (ao && ao === eid) errors.push("AO cannot be the employee themselves.");

  const nextParticipants = buildParticipantsWithOverride(allParticipants, eid, {
    ro_id: ro,
    revo_id: revo,
    ao_id: ao
  });
  const graph = buildEvaluatesGraph(nextParticipants);

  for (const evaluator of [ro, revo, ao].filter(Boolean)) {
    if (wouldCreateCycle(String(evaluator), eid, graph)) {
      errors.push("This assignment would create a circular evaluation (cycle).");
      break;
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * STEP F — Master orchestrator.
 *
 * @param {string} employeeId
 * @param {'ro'|'revo'|'ao'} field
 * @param {string|null} newValue
 * @param {UserWithLevels[]} allUsers
 * @param {ParticipantRow[]} allParticipants
 * @param {{ ro_id: string|null, revo_id: string|null, ao_id: string|null }} currentAssignments
 */
export function onSelectionChange(
  employeeId,
  field,
  newValue,
  allUsers,
  allParticipants,
  currentAssignments
) {
  const prev = {
    ro_id: asString(currentAssignments?.ro_id),
    revo_id: asString(currentAssignments?.revo_id),
    ao_id: asString(currentAssignments?.ao_id)
  };

  /** @type {{ ro_id: string|null, revo_id: string|null, ao_id: string|null }} */
  let updated = { ...prev };
  const nextValue = asString(newValue);

  if (field === "ro") {
    updated.ro_id = nextValue;
    updated.revo_id = null;
    updated.ao_id = null;
  } else if (field === "revo") {
    updated.revo_id = nextValue;
    updated.ao_id = null;
  } else if (field === "ao") {
    updated.ao_id = nextValue;
  }

  // Recompute options for this row only (other rows are left untouched by design).
  const roOptions = getValidROOptions(employeeId, allUsers, allParticipants);

  // Build a participants snapshot that includes the updated row before computing downstream options.
  const snapshot = buildParticipantsWithOverride(allParticipants, employeeId, updated);

  const revo = getValidRevOOptions(employeeId, updated.ro_id, allUsers, snapshot);
  const ao = getValidAOOptions(employeeId, updated.ro_id, updated.revo_id, allUsers, snapshot);

  // Apply auto-suggestions (pre-populate but never lock).
  /** @type {{ revo: string|null, ao: string|null }} */
  const suggestions = { revo: revo.suggestion, ao: ao.suggestion };
  /** @type {{ revo: string|null, ao: string|null }} */
  const warnings = { revo: null, ao: null };

  if (field === "ro") {
    if (revo.suggestion) updated.revo_id = revo.suggestion;
    // After applying RevO suggestion, recompute AO (because AO depends on RevO).
    const snapshot2 = buildParticipantsWithOverride(allParticipants, employeeId, updated);
    const ao2 = getValidAOOptions(employeeId, updated.ro_id, updated.revo_id, allUsers, snapshot2);
    suggestions.ao = ao2.suggestion;
    if (ao2.suggestion) updated.ao_id = ao2.suggestion;
  }

  if (field === "revo") {
    if (ao.suggestion) updated.ao_id = ao.suggestion;
  }

  // Override warnings: only show when suggestion exists AND admin picks something else.
  if (revo.warningIfOverridden && suggestions.revo && updated.revo_id && updated.revo_id !== suggestions.revo) {
    warnings.revo = revo.warningIfOverridden;
  }
  if (ao.warningIfOverridden && suggestions.ao && updated.ao_id && updated.ao_id !== suggestions.ao) {
    warnings.ao = ao.warningIfOverridden;
  }

  const hard = validateAssignmentsHard(employeeId, updated, snapshot);

  return {
    updatedAssignments: updated,
    validOptions: {
      ro: roOptions,
      revo: revo.options,
      ao: ao.options
    },
    suggestions,
    warnings,
    hardErrors: hard.errors
  };
}
