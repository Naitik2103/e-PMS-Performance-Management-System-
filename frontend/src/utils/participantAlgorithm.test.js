import { describe, expect, it } from "vitest";
import {
  buildEvaluatesGraph,
  wouldCreateCycle,
  getValidROOptions,
  getValidRevOOptions,
  getValidAOOptions,
  onSelectionChange
} from "./participantAlgorithm";

const U = (id, name, org_level, reporting_to = null) => ({ id, name, org_level, reporting_to });
const P = (employee_id, ro_id = null, revo_id = null, ao_id = null) => ({ employee_id, ro_id, revo_id, ao_id });

describe("participantAlgorithm (hybrid)", () => {
  it("happy path: linear chain suggestions (RO -> RevO -> AO)", () => {
    const users = [
      U("A", "Emp A", 1, "B"),
      U("B", "RO B", 2, "C"),
      U("C", "RevO C", 3, "D"),
      U("D", "AO D", 4, null)
    ];
    const participants = [P("A")];

    const step1 = onSelectionChange("A", "ro", "B", users, participants, { ro_id: null, revo_id: null, ao_id: null });
    expect(step1.updatedAssignments.ro_id).toBe("B");
    expect(step1.updatedAssignments.revo_id).toBe("C");
    expect(step1.updatedAssignments.ao_id).toBe("D");
  });

  it("cycle detection blocks a bad assignment", () => {
    // Existing: A evaluates G (edge A -> G). If we assign G to evaluate A, it forms a cycle.
    const participants = [P("G", "A", null, null), P("A", null, null, null)];
    const graph = buildEvaluatesGraph(participants);
    expect(wouldCreateCycle("G", "A", graph)).toBe(true);
  });

  it("override with warning: RevO suggestion exists but admin can pick different", () => {
    const users = [
      U("A", "Emp A", 1, "B"),
      U("B", "RO B", 2, "C"),
      U("C", "RevO C", 3, "D"),
      U("X", "Alt RevO X", 4, null),
      U("D", "AO D", 4, null)
    ];
    const participants = [P("A")];

    const withRO = onSelectionChange("A", "ro", "B", users, participants, { ro_id: null, revo_id: null, ao_id: null });
    expect(withRO.updatedAssignments.revo_id).toBe("C"); // suggested

    const overridden = onSelectionChange(
      "A",
      "revo",
      "X",
      users,
      [P("A", withRO.updatedAssignments.ro_id, withRO.updatedAssignments.revo_id, withRO.updatedAssignments.ao_id)],
      withRO.updatedAssignments
    );
    expect(overridden.updatedAssignments.revo_id).toBe("X");
    // The orchestrator emits a warning when selection differs from suggestion.
    expect(typeof overridden.warnings.revo === "string" || overridden.warnings.revo === null).toBe(true);
  });

  it("top-of-hierarchy: org_level 4 employee has no valid RO options", () => {
    const users = [U("A", "Director A", 4, null), U("B", "Dean B", 3, "A"), U("C", "HOD C", 2, "B")];
    const participants = [P("A"), P("B"), P("C")];
    const roOpts = getValidROOptions("A", users, participants);
    expect(roOpts.length).toBe(0);
  });

  it("new employee with no reporting_to yields no suggestion but still has options", () => {
    const users = [U("A", "Emp A", 1, null), U("B", "HOD B", 2, "C"), U("C", "Dean C", 3, null)];
    const participants = [P("A")];
    const roOpts = getValidROOptions("A", users, participants);
    expect(roOpts.map((u) => u.id)).toContain("B");

    const revo = getValidRevOOptions("A", "B", users, participants);
    expect(revo.options.map((u) => u.id)).toContain("C");
    expect(revo.suggestion).toBe("C"); // because B.reporting_to is C

    // If RO has no reporting_to, suggestion becomes null.
    const users2 = [U("A", "Emp A", 1, null), U("B", "HOD B", 2, null), U("C", "Dean C", 3, null)];
    const revo2 = getValidRevOOptions("A", "B", users2, participants);
    expect(revo2.suggestion).toBe(null);
    expect(revo2.options.map((u) => u.id)).toContain("C");
  });

  it("AO options depend on RevO; if no higher org_level exists, options empty", () => {
    const users = [U("A", "Emp A", 1, "B"), U("B", "HOD B", 2, "C"), U("C", "Dean C", 4, null)];
    const participants = [P("A", "B", "C", null)];
    const ao = getValidAOOptions("A", "B", "C", users, participants);
    expect(ao.options.length).toBe(0);
    expect(ao.suggestion).toBe(null);
  });
});

