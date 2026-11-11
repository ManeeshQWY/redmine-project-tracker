import { describe, expect, it } from "vitest";
import { makeIssue } from "../test-utils/factories";
import { buildFlow, closedDay, periodStart, wipByAssignee } from "./flow";

describe("periodStart", () => {
  it("is the Monday of the week, or the first of the month", () => {
    expect(periodStart("2026-03-11", "week")).toBe("2026-03-09"); // a Wednesday
    expect(periodStart("2026-03-09", "week")).toBe("2026-03-09");
    expect(periodStart("2026-03-15", "week")).toBe("2026-03-09"); // a Sunday belongs to the week before
    expect(periodStart("2026-03-15", "month")).toBe("2026-03-01");
  });
});

describe("closedDay", () => {
  it("is the closed date, or the last update for a closed ticket without one, or nothing for open", () => {
    expect(closedDay(makeIssue({ id: 1, closedOn: "2026-03-05T10:00:00Z" }))).toBe("2026-03-05");
    expect(closedDay(makeIssue({ id: 2, statusIsClosed: true, updatedOn: "2026-03-06T00:00:00Z" }))).toBe("2026-03-06");
    expect(closedDay(makeIssue({ id: 3 }))).toBeNull();
  });
});

describe("buildFlow", () => {
  const now = new Date("2026-03-20T12:00:00Z"); // Friday of the week starting 16 March
  const issues = [
    makeIssue({ id: 1, createdOn: "2026-03-02T00:00:00Z", status: "Closed", statusIsClosed: true, closedOn: "2026-03-04T00:00:00Z" }), // 2 days
    makeIssue({ id: 2, createdOn: "2026-03-03T00:00:00Z", status: "Closed", statusIsClosed: true, closedOn: "2026-03-12T00:00:00Z" }), // 9 days
    makeIssue({ id: 3, createdOn: "2026-03-10T00:00:00Z" }), // still open
    makeIssue({ id: 4, createdOn: "2026-03-17T00:00:00Z" }), // still open
  ];

  it("counts created, closed and the open backlog at the end of each week", () => {
    const weeks = buildFlow(issues, now, "week");
    expect(weeks.map((w) => w.key)).toEqual(["2026-03-02", "2026-03-09", "2026-03-16"]);
    expect(weeks.map((w) => [w.created, w.closed, w.backlog])).toEqual([
      [2, 1, 1], // #1 and #2 made, #1 closed: #2 open at the end of the week
      [1, 1, 1], // #3 made, #2 closed: #3 open
      [1, 0, 2], // #4 made: #3 and #4 open
    ]);
  });

  it("works out the median and 90th-percentile days to close", () => {
    const [first, second, third] = buildFlow(issues, now, "week");
    expect(first.cycleMedian).toBe(2);
    expect(second.cycleMedian).toBe(9);
    expect(third.cycleMedian).toBeNull();
    const monthly = buildFlow(issues, now, "month")[0];
    expect(monthly.closed).toBe(2);
    expect(monthly.cycleMedian).toBe(5.5); // the true median of 2 and 9, as Bug health uses
    expect(monthly.cycleP90).toBe(9);
  });

  it("marks the current period and can be limited to the latest periods", () => {
    const weeks = buildFlow(issues, now, "week", 2);
    expect(weeks.map((w) => w.key)).toEqual(["2026-03-09", "2026-03-16"]);
    expect(weeks[1].label).toContain("so far");
  });

  it("is empty with no tickets", () => {
    expect(buildFlow([], now, "week")).toEqual([]);
  });
});

describe("wipByAssignee", () => {
  const issues = [
    makeIssue({ id: 1, status: "In Progress", assignedTo: "Dan" }),
    makeIssue({ id: 2, status: "In Progress", assignedTo: "Dan" }),
    makeIssue({ id: 3, status: "In Progress", assignedTo: "Dee" }),
    makeIssue({ id: 4, status: "In Progress" }),
    makeIssue({ id: 5, status: "New", assignedTo: "Dan" }),
    makeIssue({ id: 6, tracker: "Epic", status: "In Progress", assignedTo: "Dan" }), // has a child, so not counted
    makeIssue({ id: 7, parentId: 6, status: "Closed", statusIsClosed: true, assignedTo: "Dan" }),
  ];

  it("counts in-progress leaf tickets per person and flags anyone over the limit", () => {
    expect(wipByAssignee(issues, 1)).toEqual([
      { assignee: "Dan", active: 2, overLimit: true },
      { assignee: "(Unassigned)", active: 1, overLimit: false },
      { assignee: "Dee", active: 1, overLimit: false },
    ]);
  });
});

describe("wipByAssignee with a restricted set", () => {
  it("counts only the allowed tickets but still judges 'has children' on all of them", () => {
    const all = [
      makeIssue({ id: 1, status: "In Progress", assignedTo: "Dan" }),
      makeIssue({ id: 2, status: "In Progress", assignedTo: "Dee" }),
      makeIssue({ id: 3, tracker: "Epic", status: "In Progress", assignedTo: "Dan" }),
      makeIssue({ id: 4, parentId: 3, status: "New" }),
    ];
    expect(wipByAssignee(all, 5, new Set([1, 3])).map((r) => r.assignee)).toEqual(["Dan"]); // #3 has a child, #2 is filtered out
    expect(wipByAssignee(all, 5, new Set([1, 3]))[0].active).toBe(1);
  });
});
