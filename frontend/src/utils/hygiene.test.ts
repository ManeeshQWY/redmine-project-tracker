import { describe, expect, it } from "vitest";
import { makeEntry, makeIssue } from "../test-utils/factories";
import { buildHygiene, effectiveVersion } from "./hygiene";

const issues = [
  makeIssue({ id: 1, tracker: "Epic", targetVersion: "v1" }),
  makeIssue({ id: 2, parentId: 1, assignedTo: "Dan", estimatedHours: 4, dueDate: "2026-04-01", priority: "High", description: "Do it" }),
  makeIssue({ id: 3, parentId: 1 }),
  makeIssue({ id: 4, assignedTo: "Dee", estimatedHours: 2 }),
  makeIssue({ id: 5, status: "Closed", statusIsClosed: true, doneRatio: 50 }),
];

describe("effectiveVersion", () => {
  const byId = new Map(issues.map((i) => [i.id, i]));
  it("is the ticket's own version or the nearest ancestor's", () => {
    expect(effectiveVersion(issues[1], byId)).toBe("v1");
    expect(effectiveVersion(issues[3], byId)).toBeNull();
  });

  it("survives a parent loop", () => {
    const a = makeIssue({ id: 10, parentId: 11 });
    const b = makeIssue({ id: 11, parentId: 10 });
    expect(effectiveVersion(a, new Map([[10, a], [11, b]]))).toBeNull();
  });
});

describe("buildHygiene", () => {
  it("measures how complete the open leaf tickets are", () => {
    const report = buildHygiene(issues, null);
    expect(report.openLeaves).toBe(3); // #2, #3, #4 — not the Epic, not the closed #5
    const check = (id: string) => report.checks.find((c) => c.id === id)!;
    expect(check("assignee")).toMatchObject({ have: 2, total: 3 });
    expect(check("estimate").have).toBe(2);
    expect(check("dueDate").have).toBe(1);
    expect(check("version").have).toBe(2); // #2 and #3 inherit v1
    expect(check("priority").have).toBe(1);
    expect(check("description").have).toBe(1);
    expect(check("estimate").missing.map((i) => i.id)).toEqual([3]);
    expect(check("assignee").percent).toBeCloseTo((2 / 3) * 100);
  });

  it("counts the gaps per assignee", () => {
    const people = buildHygiene(issues, null).people;
    expect(people.find((p) => p.name === "Dee")).toMatchObject({ open: 1, noDueDate: 1, noVersion: 1, noEstimate: 0 });
    expect(people.find((p) => p.name === "(Unassigned)")).toMatchObject({ open: 1, noEstimate: 1 });
  });

  it("flags closed tickets below 100% and in-progress tickets with no hours", () => {
    const report = buildHygiene([...issues, makeIssue({ id: 6, status: "In Progress", spentHours: 0 })], null);
    expect(report.problems.find((p) => p.id === "closedNotDone")).toMatchObject({ count: 1, of: 1 });
    expect(report.problems.find((p) => p.id === "activeNoTime")).toMatchObject({ count: 1, of: 1 });
  });

  it("adds the time-entry checks only when entries are loaded", () => {
    expect(buildHygiene(issues, null).problems.map((p) => p.id)).not.toContain("timeNoTicket");
    const report = buildHygiene(issues, [
      makeEntry({ id: 1, issueId: null, comments: null }),
      makeEntry({ id: 2, issueId: 1, comments: "work" }),
      makeEntry({ id: 3, issueId: 2, comments: "  " }),
    ]);
    expect(report.problems.find((p) => p.id === "timeNoTicket")).toMatchObject({ count: 1, of: 3 });
    expect(report.problems.find((p) => p.id === "timeNoComment")).toMatchObject({ count: 2, of: 3 });
  });
});
