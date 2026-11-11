import { describe, expect, it } from "vitest";
import { makeIssue } from "../test-utils/factories";
import { isDelivered, isOpenWork, leafIssues, stageOf, stageOfStatus, summarizeDelivery } from "./stages";

describe("stageOfStatus", () => {
  it("maps Redmine statuses by name, ignoring case and stray spaces", () => {
    expect(stageOfStatus("Dev Completed", false)).toBe("devDone");
    expect(stageOfStatus("dev completed", false)).toBe("devDone");
    expect(stageOfStatus("In Progress", false)).toBe("active");
    expect(stageOfStatus("New", false)).toBe("notStarted");
    expect(stageOfStatus("QA In Progress", false)).toBe("inQa");
    expect(stageOfStatus("QA Completed", false)).toBe("qaPassed");
    expect(stageOfStatus("On Hold", false)).toBe("blocked");
    expect(stageOfStatus("Duplicate ", false)).toBe("dropped"); // Redmine really has a trailing space
  });

  it("calls any closed status Done, but statuses that mean 'never built' Dropped even when closed", () => {
    expect(stageOfStatus("Closed", true)).toBe("done");
    expect(stageOfStatus("Test Passed", true)).toBe("done");
    expect(stageOfStatus("Not a Defect", true)).toBe("dropped");
    expect(stageOfStatus("Duplicate", true)).toBe("dropped");
  });

  it("treats an open status nobody mapped as active work", () => {
    expect(stageOfStatus("Some Custom Status", false)).toBe("active");
  });

  it("reads a ticket's stage", () => {
    expect(stageOf(makeIssue({ id: 1, status: "Resolved" }))).toBe("devDone");
  });
});

describe("isDelivered / isOpenWork", () => {
  it("counts Dev Completed onwards as delivered only when asked", () => {
    expect(isDelivered("devDone", true)).toBe(true);
    expect(isDelivered("devDone", false)).toBe(false);
    expect(isDelivered("inQa", true)).toBe(true);
    expect(isDelivered("active", true)).toBe(false);
    expect(isDelivered("done", false)).toBe(true);
    expect(isDelivered("dropped", true)).toBe(false);
  });

  it("is open work unless done or dropped", () => {
    expect(isOpenWork("devDone")).toBe(true);
    expect(isOpenWork("blocked")).toBe(true);
    expect(isOpenWork("done")).toBe(false);
    expect(isOpenWork("dropped")).toBe(false);
  });
});

describe("leafIssues", () => {
  it("drops every ticket that has another ticket under it", () => {
    const leaves = leafIssues([makeIssue({ id: 1 }), makeIssue({ id: 2, parentId: 1 }), makeIssue({ id: 3, parentId: 2 }), makeIssue({ id: 4 })]);
    expect(leaves.map((i) => i.id)).toEqual([3, 4]);
  });
});

describe("summarizeDelivery", () => {
  const issues = [
    makeIssue({ id: 1, tracker: "Epic", estimatedHours: 50 }), // container: not counted
    makeIssue({ id: 2, parentId: 1, status: "Dev Completed", estimatedHours: 4 }),
    makeIssue({ id: 3, parentId: 1, status: "New", estimatedHours: 6 }),
    makeIssue({ id: 4, parentId: 1, status: "Closed", statusIsClosed: true, estimatedHours: 2 }),
    makeIssue({ id: 5, parentId: 1, status: "Duplicate", statusIsClosed: true, estimatedHours: 9 }), // dropped: not in the denominator
    makeIssue({ id: 6, parentId: 1, status: "New" }), // no estimate
  ];

  it("measures delivery over leaf tickets, by count and by hours, with Dev Completed counting", () => {
    const s = summarizeDelivery(issues, true);
    expect(s.tickets).toBe(4);
    expect(s.delivered).toBe(2);
    expect(s.deliveredPercent).toBe(50);
    expect(s.estimatedHours).toBe(12);
    expect(s.deliveredEstimatedHours).toBe(6);
    expect(s.deliveredHoursPercent).toBe(50);
    expect(s.unestimated).toBe(1);
    expect(s.byStage).toMatchObject({ devDone: 1, notStarted: 2, done: 1, dropped: 1 });
  });

  it("moves the finish line back to Closed when Dev Completed does not count", () => {
    const s = summarizeDelivery(issues, false);
    expect(s.delivered).toBe(1);
    expect(s.deliveredPercent).toBe(25);
    expect(s.deliveredHoursPercent).toBeCloseTo((2 / 12) * 100);
  });

  it("has no percentage for nothing to deliver", () => {
    expect(summarizeDelivery([], true)).toMatchObject({ tickets: 0, deliveredPercent: null, deliveredHoursPercent: null });
  });
});
