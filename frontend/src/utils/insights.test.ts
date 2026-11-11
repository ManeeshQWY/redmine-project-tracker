import { describe, expect, it } from "vitest";
import { makeIssue } from "../test-utils/factories";
import { awaitingQa, bugHealth, estimateAccuracy, quickCounts } from "./insights";

const now = new Date("2026-03-20T12:00:00Z");

describe("bugHealth", () => {
  const issues = [
    makeIssue({ id: 1, tracker: "Bug", assignedTo: "Dan", createdOn: "2026-01-20T00:00:00Z" }), // 59 days old
    makeIssue({ id: 2, tracker: "Bug", assignedTo: "Dan", createdOn: "2026-03-15T00:00:00Z" }), // 5 days
    makeIssue({ id: 3, tracker: "Bug", createdOn: "2026-03-01T00:00:00Z" }), // unassigned, 19 days
    makeIssue({ id: 4, tracker: "Bug", status: "Closed", statusIsClosed: true, createdOn: "2026-03-01T00:00:00Z", closedOn: "2026-03-03T00:00:00Z" }), // 2 days
    makeIssue({ id: 5, tracker: "Bug", status: "Closed", statusIsClosed: true, createdOn: "2026-03-01T00:00:00Z", closedOn: "2026-03-07T00:00:00Z" }), // 6 days
    makeIssue({ id: 6, tracker: "Bug", status: "Not a Defect", statusIsClosed: true }), // dropped
    makeIssue({ id: 7, tracker: "Task" }),
  ];

  it("counts the open bugs per owner with how old the oldest is", () => {
    const h = bugHealth(issues, now);
    expect(h.openBugs).toBe(3);
    expect(h.byOwner).toEqual([
      { assignee: "Dan", open: 2, oldestDays: 59, over30: 1 },
      { assignee: "(Unassigned)", open: 1, oldestDays: 19, over30: 0 },
    ]);
    expect(h.oldest.map((b) => b.issue.id)).toEqual([1, 3, 2]);
  });

  it("works out the median days to close and leaves dropped bugs out", () => {
    const h = bugHealth(issues, now);
    expect(h.medianDaysToClose).toBe(4); // 2 and 6
    expect(h.closedBugs).toBe(2);
    expect(h.totalBugs).toBe(5);
    expect(h.bugShare).toBeCloseTo((5 / 6) * 100); // 5 bugs of 6 leaf tickets that count
  });

  it("is empty with no bugs", () => {
    expect(bugHealth([makeIssue({ id: 1 })], now)).toMatchObject({ openBugs: 0, medianDaysToClose: null, byOwner: [] });
  });
});

describe("estimateAccuracy", () => {
  const issues = [
    makeIssue({ id: 1, assignedTo: "Dan", status: "Closed", statusIsClosed: true, estimatedHours: 10, spentHours: 10.5 }), // within 20%
    makeIssue({ id: 2, assignedTo: "Dan", status: "Dev Completed", estimatedHours: 4, spentHours: 8 }), // 2x
    makeIssue({ id: 3, assignedTo: "Dee", status: "Closed", statusIsClosed: true, estimatedHours: 8, spentHours: 4 }), // under
    makeIssue({ id: 4, assignedTo: "Dee", status: "In Progress", estimatedHours: 5, spentHours: 9 }), // not delivered
    makeIssue({ id: 5, assignedTo: "Dee", status: "Closed", statusIsClosed: true, estimatedHours: 5 }), // nothing logged
    makeIssue({ id: 6, tracker: "Epic", status: "Closed", statusIsClosed: true, estimatedHours: 99, spentHours: 99 }), // has a child
    makeIssue({ id: 7, parentId: 6, assignedTo: "Dee", status: "Closed", statusIsClosed: true, estimatedHours: 1, spentHours: 1 }),
  ];

  it("compares estimate with hours per person on delivered leaf tickets that have both", () => {
    const a = estimateAccuracy(issues, true);
    const dan = a.rows.find((r) => r.assignee === "Dan")!;
    expect(dan).toMatchObject({ tickets: 2, estimated: 14, actual: 18.5 });
    expect(dan.ratio).toBeCloseTo(18.5 / 14);
    expect(dan.withinPercent).toBe(50);
    const dee = a.rows.find((r) => r.assignee === "Dee")!;
    expect(dee).toMatchObject({ tickets: 2, estimated: 9, actual: 5 }); // #3 and #7, not #4 (open) or #5 (no hours)
    expect(a.total).toMatchObject({ tickets: 4 });
  });

  it("lists the worst overruns first", () => {
    const worst = estimateAccuracy(issues, true).worst;
    expect(worst.map((w) => w.issue.id)).toEqual([2, 1]);
  });

  it("only counts Closed as delivered when Dev Completed does not count", () => {
    const a = estimateAccuracy(issues, false);
    expect(a.rows.find((r) => r.assignee === "Dan")!.tickets).toBe(1);
  });

  it("has no total with nothing to compare", () => {
    expect(estimateAccuracy([makeIssue({ id: 1 })], true)).toMatchObject({ rows: [], total: null, worst: [] });
  });
});

describe("awaitingQa", () => {
  it("lists Dev Completed leaf tickets, longest waiting first", () => {
    const list = awaitingQa(
      [
        makeIssue({ id: 1, status: "Dev Completed", updatedOn: "2026-03-18T00:00:00Z" }),
        makeIssue({ id: 2, status: "Dev Completed", updatedOn: "2026-03-01T00:00:00Z" }),
        makeIssue({ id: 3, status: "QA In Progress" }),
        makeIssue({ id: 4, tracker: "Epic", status: "Dev Completed" }),
        makeIssue({ id: 5, parentId: 4, status: "New" }),
      ],
      now
    );
    expect(list.map((a) => [a.issue.id, a.waitingDays])).toEqual([[2, 19], [1, 2]]);
  });
});

describe("quickCounts", () => {
  it("counts open leaf tickets nobody owns, with no estimate, and overdue, plus the week's flow", () => {
    const c = quickCounts(
      [
        makeIssue({ id: 1, assignedTo: "Dan", estimatedHours: 2, dueDate: "2026-03-01", createdOn: "2026-02-01T00:00:00Z" }), // overdue
        makeIssue({ id: 2, createdOn: "2026-03-18T00:00:00Z" }), // unassigned, no estimate, made this week
        makeIssue({ id: 3, status: "Closed", statusIsClosed: true, closedOn: "2026-03-19T00:00:00Z", createdOn: "2026-02-01T00:00:00Z" }),
        makeIssue({ id: 4, tracker: "Epic", createdOn: "2026-02-01T00:00:00Z" }),
        makeIssue({ id: 5, parentId: 4, assignedTo: "Dee", estimatedHours: 1, createdOn: "2026-02-01T00:00:00Z" }),
      ],
      now
    );
    expect(c).toEqual({ unassigned: 1, noEstimate: 1, overdue: 1, created7: 1, closed7: 1 });
  });
});
