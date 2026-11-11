import { describe, expect, it } from "vitest";
import { makeEntry, makeIssue } from "../test-utils/factories";
import { daysBetween, lastActivity, lastLoggedByIssue, stalenessMatrix, workingDaysBetween } from "./activity";
import { STAGE_LABELS } from "./stages";

describe("daysBetween / workingDaysBetween", () => {
  it("counts whole calendar days and never goes negative", () => {
    expect(daysBetween("2026-03-01T12:00:00Z", "2026-03-05")).toBe(4);
    expect(daysBetween("2026-03-05", "2026-03-01")).toBe(0);
  });

  it("counts Monday to Friday only — Friday to Monday is one working day", () => {
    expect(workingDaysBetween("2026-03-06", "2026-03-09")).toBe(1); // Fri → Mon
    expect(workingDaysBetween("2026-03-02", "2026-03-06")).toBe(4); // Mon → Fri
    expect(workingDaysBetween("2026-03-06", "2026-03-06")).toBe(0);
  });
});

describe("last activity", () => {
  it("is the later of the last update and the last hours logged", () => {
    const logged = lastLoggedByIssue([
      makeEntry({ id: 1, issueId: 5, spentOn: "2026-03-15" }),
      makeEntry({ id: 2, issueId: 5, spentOn: "2026-03-10" }),
      makeEntry({ id: 3, issueId: null, spentOn: "2026-03-30" }),
    ]);
    expect(logged.get(5)).toBe("2026-03-15");
    expect(logged.size).toBe(1);
    const issue = makeIssue({ id: 5, updatedOn: "2026-03-12T08:00:00Z" });
    expect(lastActivity(issue, logged)).toBe("2026-03-15");
    expect(lastActivity(issue, null)).toBe("2026-03-12");
    expect(lastActivity(makeIssue({ id: 5, updatedOn: "2026-03-20T00:00:00Z" }), logged)).toBe("2026-03-20");
  });
});

describe("stalenessMatrix", () => {
  const now = new Date("2026-03-20T12:00:00Z");
  const issues = [
    makeIssue({ id: 1, status: "In Progress", updatedOn: "2026-03-19T00:00:00Z", assignedTo: "Dan" }), // 1 day
    makeIssue({ id: 2, status: "In Progress", updatedOn: "2026-03-10T00:00:00Z", assignedTo: "Dan" }), // 10 days
    makeIssue({ id: 3, status: "New", updatedOn: "2026-01-01T00:00:00Z" }), // 78 days, unassigned
    makeIssue({ id: 4, status: "Closed", statusIsClosed: true, updatedOn: "2025-01-01T00:00:00Z" }), // not open
  ];

  it("buckets open tickets by days since update, by stage, with the stalest rows first", () => {
    const rows = stalenessMatrix(issues, now, "stage", STAGE_LABELS);
    expect(rows.map((r) => r.label)).toEqual(["Not started", "Active"]);
    expect(rows[0].buckets.map((b) => b.length)).toEqual([0, 0, 0, 0, 1]);
    expect(rows[1].buckets.map((b) => b.length)).toEqual([1, 0, 1, 0, 0]);
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(3);
  });

  it("can group by assignee", () => {
    const rows = stalenessMatrix(issues, now, "assignee", STAGE_LABELS);
    expect(rows.map((r) => [r.label, r.total])).toEqual([["(Unassigned)", 1], ["Dan", 2]]);
  });

  it("uses logged hours to show a ticket is not idle", () => {
    const logged = lastLoggedByIssue([makeEntry({ id: 1, issueId: 2, spentOn: "2026-03-19" })]);
    const rows = stalenessMatrix(issues, now, "stage", STAGE_LABELS, logged);
    expect(rows.find((r) => r.key === "active")!.buckets.map((b) => b.length)).toEqual([2, 0, 0, 0, 0]);
  });
});
