/**
 * Backend mirror of the hybrid participant assignment algorithm.
 * Pure functions only; no Express/DB code here.
 *
 * NOTE: Keep logic aligned with frontend `frontend/src/utils/participantAlgorithm.js`.
 */

const asString = (v) => (v == null ? null : String(v));

/**
 * evaluates[X] = array of employee_ids that X evaluates
 * (X appears as RO/RevO/AO for that employee).
 *
 * @param {{ employee_id: string, ro_id?: string|null, revo_id?: string|null, ao_id?: string|null }[]} allParticipants
 * @returns {Record<string, string[]>}
 */
export function buildEvaluatesGraph(allParticipants) {
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

  const evaluates = {};
  for (const [k, set] of map.entries()) evaluates[k] = Array.from(set);
  return evaluates;
}

/**
 * Iterative DFS cycle detection.
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

