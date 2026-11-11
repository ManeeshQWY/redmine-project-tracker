import { describe, expect, it } from "vitest";
import { makeEntry, makeIssue } from "../test-utils/factories";
import { buildChaseTiles, chaseTileAsText, DEFAULT_CHASE_SETTINGS, groupByAssignee } from "./chase";

const now = new Date("2026-03-20T12:00:00Z"); // a Friday

const issues = [
  makeIssue({ id: 1, status: "In Progress", assignedTo: "Dan", updatedOn: "2026-03-10T00:00:00Z", estimatedHours: 10, spentHours: 15 }),
  makeIssue({ id: 2, status: "In Progress", assignedTo: null, updatedOn: "2026-03-19T00:00:00Z" }),
  makeIssue({ id: 3, status: "New", assignedTo: "Dee", estimatedHours: 4, spentHours: 2 }),
  makeIssue({ id: 4, status: "Dev Completed", assignedTo: "Dee", estimatedHours: 3, spentHours: 0 }),
  makeIssue({ id: 5, status: "On Hold", assignedTo: "Dee", estimatedHours: 1, dueDate: "2026-03-01" }),
  makeIssue({ id: 6, tracker: "Epic", status: "In Progress", assignedTo: "Dan" }), // container: never chased
  makeIssue({ id: 7, parentId: 6, status: "Closed", statusIsClosed: true, assignedTo: "Dan", estimatedHours: 2 }),
];

const ids = (tileId: string, tiles = buildChaseTiles(issues, null, DEFAULT_CHASE_SETTINGS, now)) =>
  tiles.find((t) => t.id === tileId)!.items.map((i) => i.issue.id);

describe("buildChaseTiles", () => {
  it("finds each kind of ticket that needs chasing, on leaf tickets only", () => {
    const tiles = buildChaseTiles(issues, null, DEFAULT_CHASE_SETTINGS, now);
    expect(ids("stale", tiles)).toEqual([1]); // idle 8 working days; #2 was updated yesterday
    expect(ids("activeUnassigned", tiles)).toEqual([2]);
    expect(ids("unassigned", tiles)).toEqual([2]);
    expect(ids("noEstimate", tiles)).toEqual([2]);
    expect(ids("loggedButNew", tiles)).toEqual([3]);
    expect(ids("devDoneNoTime", tiles)).toEqual([4]);
    expect(ids("overBudget", tiles)).toEqual([1]); // 15 h on 10 h is 150%
    expect(ids("overdue", tiles)).toEqual([5]);
    expect(ids("blocked", tiles)).toEqual([5]);
  });

  it("lists what moved in the last day, including parents", () => {
    expect(ids("moved")).toEqual([2]);
    const wide = buildChaseTiles(issues, null, { ...DEFAULT_CHASE_SETTINGS, movedDays: 30 }, now);
    expect([...ids("moved", wide)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]); // #6 is a parent
  });

  it("does not call a ticket stale when hours were logged on it recently", () => {
    const entries = [makeEntry({ id: 1, issueId: 1, spentOn: "2026-03-19" })];
    expect(ids("stale", buildChaseTiles(issues, entries, DEFAULT_CHASE_SETTINGS, now))).toEqual([]);
  });

  it("respects the thresholds", () => {
    const strict = buildChaseTiles(issues, null, { ...DEFAULT_CHASE_SETTINGS, overBudgetPercent: 200 }, now);
    expect(ids("overBudget", strict)).toEqual([]);
    const lax = buildChaseTiles(issues, null, { ...DEFAULT_CHASE_SETTINGS, staleWorkingDays: 30 }, now);
    expect(ids("stale", lax)).toEqual([]);
  });

  it("notes the hours and how long a ticket has been idle", () => {
    const tile = buildChaseTiles(issues, null, DEFAULT_CHASE_SETTINGS, now).find((t) => t.id === "overBudget")!;
    expect(tile.items[0].note).toBe("15 h of 10 h");
    expect(tile.items[0].idleDays).toBe(10);
  });
});

describe("grouping and text", () => {
  it("groups by assignee, largest first, and writes a pasteable list", () => {
    const tile = buildChaseTiles(issues, null, { ...DEFAULT_CHASE_SETTINGS, movedDays: 30 }, now).find((t) => t.id === "moved")!;
    const groups = groupByAssignee(tile.items);
    expect(groups.map((g) => [g.assignee, g.items.length])).toEqual([["Dan", 3], ["Dee", 3], ["(Unassigned)", 1]]); // largest first, ties by name
    const text = chaseTileAsText(tile);
    expect(text.split("\n")[0]).toBe(`What moved (${tile.items.length})`);
    expect(text).toContain("Dee (3)");
    expect(text).toContain("#3 Ticket 3 — New, idle");
  });
});
