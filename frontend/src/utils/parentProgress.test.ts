import { describe, expect, it } from "vitest";
import { Issue } from "../types/issue";
import {
  buildParentProgress,
  buildStatusSeries,
  childHours,
  filterParentProgress,
  MAX_STATUS_SLOTS,
  ParentFilters,
  seriesCounts,
  sortParentProgress,
  summarizeParents,
} from "./parentProgress";

function issue(overrides: Partial<Issue> & { id: number }): Issue {
  return {
    parentId: null, project: "Proj", tracker: "Task", status: "New", statusIsClosed: false, priority: "Normal",
    author: "A", subject: `Ticket ${overrides.id}`, description: null, doneRatio: 0, createdOn: "2026-03-10T00:00:00Z",
    updatedOn: "2026-03-10T00:00:00Z", assignedTo: null, targetVersion: null, targetVersionId: null, startDate: null,
    dueDate: null, closedOn: null, estimatedHours: null, spentHours: null, totalSpentHours: null, totalEstimatedHours: null,
    assignedQA: null, platform: null, additionalAssignee: null, additionalAssignees: [], assignedQAs: [],
    estimatedTimeForQA: null, customFields: [],
    ...overrides,
  };
}

const closed = { status: "Closed", statusIsClosed: true };

describe("buildParentProgress", () => {
  it("counts the child tickets under a parent and splits them by status", () => {
    const rows = buildParentProgress([
      issue({ id: 1, tracker: "Epic", subject: "Checkout" }),
      issue({ id: 2, parentId: 1, status: "New" }),
      issue({ id: 3, parentId: 1, status: "In Progress" }),
      issue({ id: 4, parentId: 1, status: "In Progress" }),
      issue({ id: 5, parentId: 1, ...closed }),
    ]);
    expect(rows).toHaveLength(1);
    const epic = rows[0];
    expect(epic.id).toBe(1);
    expect(epic.total).toBe(4);
    expect(epic.byStatus).toEqual({ New: 1, "In Progress": 2, Closed: 1 });
    expect(epic.closed).toBe(1);
    expect(epic.open).toBe(3);
    expect(epic.closedPercent).toBe(25);
  });

  it("only lists tickets that actually have children", () => {
    const rows = buildParentProgress([issue({ id: 1 }), issue({ id: 2 }), issue({ id: 3, parentId: 2 })]);
    expect(rows.map((r) => r.id)).toEqual([2]);
  });

  it("includes grandchildren by default and only direct children when asked", () => {
    const issues = [
      issue({ id: 1, tracker: "Epic" }),
      issue({ id: 2, parentId: 1, tracker: "Feature" }),
      issue({ id: 3, parentId: 2, ...closed }),
      issue({ id: 4, parentId: 2, ...closed }),
    ];
    const all = buildParentProgress(issues, "all");
    const direct = buildParentProgress(issues, "direct");

    expect(all.find((r) => r.id === 1)!.total).toBe(3); // the feature and its two tasks
    expect(all.find((r) => r.id === 1)!.closed).toBe(2);
    expect(direct.find((r) => r.id === 1)!.total).toBe(1); // only the feature
    expect(direct.find((r) => r.id === 2)!.total).toBe(2);
  });

  it("treats a closed status by its closed flag, whatever the status is called", () => {
    const rows = buildParentProgress([
      issue({ id: 1 }),
      issue({ id: 2, parentId: 1, status: "Not a Defect", statusIsClosed: true }),
      issue({ id: 3, parentId: 1, status: "Custom Open", statusIsClosed: false }),
    ]);
    expect(rows[0].closed).toBe(1);
    expect(rows[0].closedPercent).toBe(50);
  });

  it("averages the children's own percent done", () => {
    const rows = buildParentProgress([
      issue({ id: 1 }),
      issue({ id: 2, parentId: 1, doneRatio: 100 }),
      issue({ id: 3, parentId: 1, doneRatio: 50 }),
      issue({ id: 4, parentId: 1, doneRatio: 0 }),
    ]);
    expect(rows[0].avgDonePercent).toBe(50);
  });

  it("uses Redmine's own totals for the parent's estimate and time spent, falling back to its own", () => {
    const rows = buildParentProgress([
      issue({ id: 1, totalEstimatedHours: 40, estimatedHours: 5, totalSpentHours: 12, spentHours: 2 }),
      issue({ id: 2, parentId: 1 }),
      issue({ id: 3, estimatedHours: 8, spentHours: 3 }),
      issue({ id: 4, parentId: 3 }),
    ]);
    expect(rows.find((r) => r.id === 1)).toMatchObject({ estimatedHours: 40, spentHours: 12 });
    expect(rows.find((r) => r.id === 3)).toMatchObject({ estimatedHours: 8, spentHours: 3 });
  });

  it("ignores a child whose parent is not loaded, and survives a parent cycle", () => {
    expect(buildParentProgress([issue({ id: 2, parentId: 999 })])).toEqual([]);
    expect(() =>
      buildParentProgress([issue({ id: 1, parentId: 2 }), issue({ id: 2, parentId: 1 })], "all")
    ).not.toThrow();
  });
});

describe("filter, sort and summary", () => {
  const issues = [
    issue({ id: 1, tracker: "Epic", subject: "Checkout", status: "In Progress" }),
    issue({ id: 2, parentId: 1, ...closed }),
    issue({ id: 3, parentId: 1 }),
    issue({ id: 4, tracker: "Feature", subject: "Search", ...closed }),
    issue({ id: 5, parentId: 4, ...closed }),
    issue({ id: 6, tracker: "Feature", parentId: 1, subject: "Cart" }),
    issue({ id: 7, parentId: 6 }),
    issue({ id: 8, parentId: 6 }),
    issue({ id: 9, parentId: 6 }),
  ];
  const rows = buildParentProgress(issues, "all");
  const none: ParentFilters = { trackers: [], search: "", state: "all", topLevelOnly: false };

  it("filters by the parent's tracker, search text or #id, and its own state", () => {
    expect(filterParentProgress(rows, { ...none, trackers: ["Feature"] }).map((r) => r.id).sort()).toEqual([4, 6]);
    expect(filterParentProgress(rows, { ...none, search: "cart" }).map((r) => r.id)).toEqual([6]);
    expect(filterParentProgress(rows, { ...none, search: "#4" }).map((r) => r.id)).toEqual([4]);
    expect(filterParentProgress(rows, { ...none, state: "closed" }).map((r) => r.id)).toEqual([4]);
    expect(filterParentProgress(rows, { ...none, state: "open" }).map((r) => r.id).sort()).toEqual([1, 6]);
  });

  it("can show only top-level parents", () => {
    expect(filterParentProgress(rows, { ...none, topLevelOnly: true }).map((r) => r.id).sort()).toEqual([1, 4]);
  });

  it("sorts by size, open work and completion", () => {
    expect(sortParentProgress(rows, "total").map((r) => r.id)).toEqual([1, 6, 4]);
    expect(sortParentProgress(rows, "open")[0].id).toBe(1);
    expect(sortParentProgress(rows, "lowestComplete")[0].id).toBe(6); // 0% done
    expect(sortParentProgress(rows, "highestComplete")[0].id).toBe(4); // 100%
  });

  it("counts a ticket once even when it sits under two shown parents", () => {
    // the Epic (1) contains Feature 6 and its tasks, so they appear under both parents
    const summary = summarizeParents(filterParentProgress(rows, { ...none, trackers: ["Epic", "Feature"] }), issues);
    expect(summary.parents).toBe(3);
    expect(summary.children).toBe(7); // 2,3,6,7,8,9 under the Epic + 5 under Search — each once
    expect(summary.closed).toBe(2); // 2 and 5
    expect(summary.closedPercent).toBeCloseTo((2 / 7) * 100);
  });

  it("has no percentage for an empty selection", () => {
    expect(summarizeParents([], issues).closedPercent).toBeNull();
  });
});

describe("status series (chart colours)", () => {
  it("gives each status a fixed slot in Redmine's configured order, among those that occur", () => {
    const series = buildStatusSeries(["New", "In Progress", "Resolved", "Closed"], ["Closed", "New"]);
    expect(series.map((s) => [s.key, s.label])).toEqual([["s0", "New"], ["s1", "Closed"]]);
  });

  it("does not repaint a status when others appear or disappear in a filtered view", () => {
    const order = ["New", "In Progress", "Resolved", "Closed"];
    const wide = buildStatusSeries(order, ["New", "In Progress", "Closed"]);
    const narrow = buildStatusSeries(order, ["New", "In Progress", "Closed"]);
    expect(wide).toEqual(narrow); // built from the whole project, so any view shares one mapping
  });

  it("puts statuses Redmine did not list after the listed ones", () => {
    const series = buildStatusSeries(["New"], ["Zeta", "New", "Alpha"]);
    expect(series.map((s) => s.label)).toEqual(["New", "Alpha", "Zeta"]);
  });

  it("folds statuses beyond the eight slots into a grey Other", () => {
    const names = Array.from({ length: 11 }, (_, i) => `Status ${i + 1}`);
    const series = buildStatusSeries(names, names);
    expect(series).toHaveLength(MAX_STATUS_SLOTS + 1);
    const other = series[series.length - 1];
    expect(other.key).toBe("other");
    expect(other.statuses).toEqual(["Status 9", "Status 10", "Status 11"]);
  });

  it("counts a parent's children per series, including the folded Other", () => {
    const names = Array.from({ length: 10 }, (_, i) => `S${i + 1}`);
    const rows = buildParentProgress([
      issue({ id: 1 }),
      issue({ id: 2, parentId: 1, status: "S1" }),
      issue({ id: 3, parentId: 1, status: "S9" }),
      issue({ id: 4, parentId: 1, status: "S10" }),
    ]);
    const counts = seriesCounts(rows[0], buildStatusSeries(names, names));
    expect(counts.s0).toBe(1);
    expect(counts.other).toBe(2);
  });
});

describe("childHours", () => {
  const child = issue({ id: 2, estimatedHours: 3, spentHours: 1, totalEstimatedHours: 10, totalSpentHours: 6 });

  it("shows a ticket's own hours when every descendant is listed, so the rows add up", () => {
    expect(childHours(child, "all")).toEqual({ estimated: 3, spent: 1 });
  });

  it("shows Redmine's total for the ticket when only direct children are listed", () => {
    expect(childHours(child, "direct")).toEqual({ estimated: 10, spent: 6 });
  });

  it("falls back to the ticket's own hours without a total, and is blank without either", () => {
    expect(childHours(issue({ id: 3, estimatedHours: 4, spentHours: 2 }), "direct")).toEqual({ estimated: 4, spent: 2 });
    expect(childHours(issue({ id: 4 }), "all")).toEqual({ estimated: null, spent: null });
  });
});
