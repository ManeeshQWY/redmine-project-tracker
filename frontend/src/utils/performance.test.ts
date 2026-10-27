import { describe, expect, it } from "vitest";
import { Issue, TimeEntry } from "../types/issue";
import {
  buildPerformanceRows,
  buildRoleLookup,
  bugLinkStats,
  DateRange,
  EMPTY_PERFORMANCE_FILTERS,
  filterPerformanceRows,
  groupPerformanceRows,
  isTaskTracker,
  parseQaEstimateHours,
  sortPerformanceRows,
  totalsOf,
} from "./performance";

const NO_RANGE: DateRange = { from: null, to: null };

// The master list used by most tests: Dan and Dee are Developers, Quinn is QA.
const ROLES = buildRoleLookup(["Dev Dan", "Dev Dee"], ["Quinn QA"]);

function issue(overrides: Partial<Issue> & { id: number }): Issue {
  return {
    parentId: null, project: "Proj", tracker: "Story", status: "New", statusIsClosed: false,
    priority: "Normal", author: "Someone", subject: `Ticket ${overrides.id}`, description: null,
    doneRatio: 0, createdOn: "2026-03-10T00:00:00Z", updatedOn: "2026-03-10T00:00:00Z",
    assignedTo: null, targetVersion: null, targetVersionId: null, startDate: null, dueDate: null,
    closedOn: null, estimatedHours: null, spentHours: null, totalSpentHours: null,
    totalEstimatedHours: null, assignedQA: null, platform: null, additionalAssignee: null,
    additionalAssignees: [], assignedQAs: [], estimatedTimeForQA: null, customFields: [],
    ...overrides,
  };
}

function entry(overrides: Partial<TimeEntry> & { id: number; issueId: number | null; user: string; hours: number }): TimeEntry {
  return { project: "Proj", activity: "Dev", comments: null, spentOn: "2026-03-15", ...overrides };
}

const qa = (name: string) => ({ id: name.length, name });

function build(issues: Issue[], entries: TimeEntry[] = [], range: DateRange = NO_RANGE, roles = ROLES) {
  return buildPerformanceRows(issues, entries, range, roles);
}

function rowFor(rows: ReturnType<typeof build>, taskId: number, name: string) {
  return rows.find((r) => r.taskId === taskId && r.name === name);
}

describe("isTaskTracker", () => {
  it("accepts the configured trackers regardless of case, plural or separators", () => {
    for (const t of ["Epic", "Feature", "Story", "Bug", "Change request", "Change Requests", "change-request", "CR", "Suggestion"]) {
      expect(isTaskTracker(t)).toBe(true);
    }
  });
  it("rejects other trackers", () => {
    expect(isTaskTracker("Support")).toBe(false);
    expect(isTaskTracker("Task")).toBe(false);
  });
});

describe("parseQaEstimateHours", () => {
  it("parses plain, decimal, comma-decimal, unit-suffixed and h:mm values", () => {
    expect(parseQaEstimateHours("4")).toBe(4);
    expect(parseQaEstimateHours("4.5")).toBe(4.5);
    expect(parseQaEstimateHours("4,5")).toBe(4.5);
    expect(parseQaEstimateHours("4h")).toBe(4);
    expect(parseQaEstimateHours("2:30")).toBe(2.5);
  });
  it("returns null for blank or unparseable text", () => {
    expect(parseQaEstimateHours(null)).toBeNull();
    expect(parseQaEstimateHours("")).toBeNull();
    expect(parseQaEstimateHours("TBD")).toBeNull();
  });
});

describe("buildRoleLookup", () => {
  it("matches names ignoring case and surrounding spaces", () => {
    const lookup = buildRoleLookup([" Dev Dan "], ["QUINN qa"]);
    const rows = build(
      [issue({ id: 1, assignedTo: "dev dan", assignedQAs: [qa("Quinn QA")] })],
      [],
      NO_RANGE,
      lookup
    );
    expect(rowFor(rows, 1, "dev dan")!.role).toBe("Developer");
    expect(rowFor(rows, 1, "Quinn QA")!.role).toBe("QA");
  });

  it("gives a person listed under both roles no role", () => {
    const lookup = buildRoleLookup(["Both"], ["Both"], ["Both"]);
    const rows = build([issue({ id: 1, assignedTo: "Both" })], [], NO_RANGE, lookup);
    expect(rows[0].role).toBe("Unknown");
  });
});

describe("buildPerformanceRows — role comes only from the master list", () => {
  it("does not infer a role from ticket fields: an assignee not in the list is Unknown", () => {
    const rows = build([issue({ id: 1, assignedTo: "Stranger", estimatedHours: 8 })]);
    expect(rowFor(rows, 1, "Stranger")!.role).toBe("Unknown");
  });

  it("shows the ticket's estimate against its not-yet-listed assignees, without giving them a role", () => {
    const row = rowFor(build([issue({ id: 1, assignedTo: "Stranger", estimatedHours: 8 })]), 1, "Stranger")!;
    expect(row.role).toBe("Unknown");
    expect(row.estimation).toBe(8);
  });

  it("splits that fallback estimate between several unlisted assignees", () => {
    const rows = build([
      issue({ id: 1, assignedTo: "Stranger", additionalAssignees: [{ id: 9, name: "Other" }], estimatedHours: 8 }),
    ]);
    expect(rowFor(rows, 1, "Stranger")!.estimation).toBe(4);
    expect(rowFor(rows, 1, "Other")!.estimation).toBe(4);
  });

  it("never hands the developer estimate to someone only named as Assigned QA", () => {
    const rows = build([issue({ id: 1, assignedQAs: [qa("Stranger")], estimatedHours: 8 })]);
    expect(rowFor(rows, 1, "Stranger")!.estimation).toBeNull();
  });

  it("does not double count: a listed developer keeps the whole estimate, unlisted assignees get none", () => {
    const rows = build([
      issue({ id: 1, assignedTo: "Dev Dan", additionalAssignees: [{ id: 9, name: "Stranger" }], estimatedHours: 8 }),
    ]);
    expect(rowFor(rows, 1, "Dev Dan")!.estimation).toBe(8);
    expect(rowFor(rows, 1, "Stranger")!.estimation).toBeNull();
  });

  it("does not make someone QA just because they are the Assigned QA", () => {
    const rows = build([issue({ id: 1, assignedQAs: [qa("Stranger")], estimatedTimeForQA: "3" })]);
    expect(rowFor(rows, 1, "Stranger")!.role).toBe("Unknown");
    expect(rowFor(rows, 1, "Stranger")!.estimation).toBeNull();
  });

  it("uses the list even when it contradicts the ticket: a listed QA in the Assignee field is QA", () => {
    const rows = build([issue({ id: 1, assignedTo: "Quinn QA", estimatedHours: 8, estimatedTimeForQA: "3" })]);
    const row = rowFor(rows, 1, "Quinn QA")!;
    expect(row.role).toBe("QA");
    expect(row.estimation).toBe(3); // QA gets the QA estimate, not the developer estimate
  });

  it("still credits bugs under a ticket to people not in the list, so they are not shown as zero", () => {
    const issues = [
      issue({ id: 1, assignedTo: "Stranger" }),
      issue({ id: 2, parentId: 1, tracker: "Bug" }),
    ];
    const row = rowFor(build(issues), 1, "Stranger")!;
    expect(row.role).toBe("Unknown");
    expect(row.bugsReported).toBe(1);
  });

  it("is Unknown for everyone when the list is empty", () => {
    const rows = build([issue({ id: 1, assignedTo: "Dev Dan" })], [entry({ id: 1, issueId: 1, user: "Dev Dan", hours: 2 })], NO_RANGE, buildRoleLookup([], []));
    expect(rows.every((r) => r.role === "Unknown")).toBe(true);
    expect(rows[0].actuals).toBe(2); // the data is still there
  });
});

describe("buildPerformanceRows — figures", () => {
  it("gives each listed person their estimate and hours on a ticket", () => {
    const issues = [
      issue({ id: 1, assignedTo: "Dev Dan", assignedQAs: [qa("Quinn QA")], estimatedHours: 8, estimatedTimeForQA: "3" }),
    ];
    const entries = [
      entry({ id: 1, issueId: 1, user: "Dev Dan", hours: 6 }),
      entry({ id: 2, issueId: 1, user: "Quinn QA", hours: 2 }),
    ];
    const rows = build(issues, entries);

    const dev = rowFor(rows, 1, "Dev Dan")!;
    expect(dev.role).toBe("Developer");
    expect(dev.estimation).toBe(8);
    expect(dev.actuals).toBe(6);

    const tester = rowFor(rows, 1, "Quinn QA")!;
    expect(tester.role).toBe("QA");
    expect(tester.estimation).toBe(3);
    expect(tester.actuals).toBe(2);
  });

  it("consolidates a child ticket's hours, estimate and bugs into the parent task", () => {
    const issues = [
      issue({ id: 1, tracker: "Epic", assignedTo: "Dev Dan" }),
      issue({ id: 2, parentId: 1, assignedTo: "Dev Dan", estimatedHours: 5 }),
      issue({ id: 3, parentId: 2, tracker: "Bug", author: "Quinn QA" }),
    ];
    const entries = [
      entry({ id: 1, issueId: 2, user: "Dev Dan", hours: 4 }),
      entry({ id: 2, issueId: 3, user: "Dev Dan", hours: 1 }),
    ];
    const rows = build(issues, entries);

    const epic = rowFor(rows, 1, "Dev Dan")!;
    expect(epic.actuals).toBe(5); // child + grandchild bug
    expect(epic.estimation).toBe(5);
    expect(epic.bugsReported).toBe(1);

    // the child is itself a task row and sees only its own subtree
    const story = rowFor(rows, 2, "Dev Dan")!;
    expect(story.actuals).toBe(5);
    expect(story.bugsReported).toBe(1);
  });

  it("credits bugs to Developers on the ticket above them and to the listed QA who filed them", () => {
    const issues = [
      issue({ id: 1, assignedTo: "Dev Dan", assignedQAs: [qa("Quinn QA")] }),
      issue({ id: 2, parentId: 1, tracker: "Bug", author: "Quinn QA" }),
      issue({ id: 3, parentId: 1, tracker: "Bug", author: "Quinn QA" }),
      issue({ id: 4, parentId: 1, tracker: "Bug", author: "Rita PM" }),
    ];
    const rows = build(issues);

    expect(rowFor(rows, 1, "Dev Dan")!.bugsReported).toBe(3);
    expect(rowFor(rows, 1, "Quinn QA")!.bugsReported).toBe(2);
    // an author who isn't a listed QA gets no row for filing a bug
    expect(rowFor(rows, 1, "Rita PM")).toBeUndefined();
  });

  it("does not credit a QA for a bug on a ticket they are not working on", () => {
    const issues = [
      issue({ id: 1, assignedTo: "Dev Dan" }), // Quinn is neither named on it nor logged time
      issue({ id: 2, parentId: 1, tracker: "Bug", author: "Quinn QA" }),
    ];
    expect(rowFor(build(issues), 1, "Quinn QA")).toBeUndefined();
  });

  it("credits a QA who logged time on the ticket even if they are not named on it", () => {
    const issues = [
      issue({ id: 1, assignedTo: "Dev Dan" }),
      issue({ id: 2, parentId: 1, tracker: "Bug", author: "Quinn QA" }),
    ];
    const rows = build(issues, [entry({ id: 1, issueId: 1, user: "Quinn QA", hours: 1 })]);
    expect(rowFor(rows, 1, "Quinn QA")!.bugsReported).toBe(1);
  });

  it("credits a QA for a bug on a child ticket they are working on, within the parent task", () => {
    const issues = [
      issue({ id: 1, tracker: "Epic", assignedTo: "Dev Dan" }),
      issue({ id: 2, parentId: 1, assignedQAs: [qa("Quinn QA")] }),
      issue({ id: 3, parentId: 2, tracker: "Bug", author: "Quinn QA" }),
    ];
    expect(rowFor(build(issues), 1, "Quinn QA")!.bugsReported).toBe(1);
  });

  it("does not credit a QA for a bug on a sibling ticket they are not working on", () => {
    const issues = [
      issue({ id: 1, tracker: "Epic", assignedTo: "Dev Dan" }),
      issue({ id: 2, parentId: 1, assignedQAs: [qa("Quinn QA")] }),
      issue({ id: 4, parentId: 1, assignedTo: "Dev Dee" }), // Quinn has nothing to do with #4
      issue({ id: 5, parentId: 4, tracker: "Bug", author: "Quinn QA" }),
    ];
    // Quinn is on #2 only; the bug sits under #4, which is not above #2
    expect(rowFor(build(issues), 1, "Quinn QA")!.bugsReported).toBe(0);
  });

  it("counts a bug assigned to a developer even when it has no parent (the usual case)", () => {
    const ct = [{ id: 9, name: "Testing Type", value: ["CT"] }];
    const issues = [issue({ id: 26367, tracker: "Bug", assignedTo: "Dev Dan", customFields: ct })];
    const row = rowFor(build(issues), 26367, "Dev Dan")!;
    expect(row.bugsReported).toBe(1);
    expect(row.ctBugs).toBe(1);
  });

  it("counts a bug assigned to a developer under a task they are not otherwise on", () => {
    const issues = [
      issue({ id: 1, tracker: "Epic", assignedTo: "Dev Dee" }),
      issue({ id: 2, parentId: 1, tracker: "Bug", assignedTo: "Dev Dan" }),
    ];
    const rows = build(issues);
    expect(rowFor(rows, 1, "Dev Dan")!.bugsReported).toBe(1); // on the Epic's consolidated row
    expect(rowFor(rows, 2, "Dev Dan")!.bugsReported).toBe(1); // and on the bug's own row
    expect(rowFor(rows, 1, "Dev Dee")!.bugsReported).toBe(1); // reported against Dee's Epic
  });

  it("counts an additional assignee's bug too", () => {
    const issues = [issue({ id: 5, tracker: "Bug", assignedTo: "Dev Dan", additionalAssignees: [{ id: 7, name: "Dev Dee" }] })];
    const rows = build(issues);
    expect(rowFor(rows, 5, "Dev Dan")!.bugsReported).toBe(1);
    expect(rowFor(rows, 5, "Dev Dee")!.bugsReported).toBe(1);
  });

  it("does not credit a QA with a bug just because it is assigned to them", () => {
    const issues = [issue({ id: 5, tracker: "Bug", assignedTo: "Quinn QA" })];
    expect(rowFor(build(issues), 5, "Quinn QA")!.bugsReported).toBe(0);
  });

  it("does not count an assigned bug whose status is Not a bug", () => {
    const issues = [issue({ id: 5, tracker: "Bug", status: "Not a bug", assignedTo: "Dev Dan" })];
    expect(rowFor(build(issues), 5, "Dev Dan")!.bugsReported).toBe(0);
  });

  it("totals count an assigned bug once even though it appears on its own row and its parent's", () => {
    const issues = [
      issue({ id: 1, tracker: "Epic", assignedTo: "Dev Dan" }),
      issue({ id: 2, parentId: 1, tracker: "Bug", assignedTo: "Dev Dan" }),
    ];
    const danRows = build(issues).filter((r) => r.name === "Dev Dan");
    expect(danRows).toHaveLength(2);
    expect(totalsOf(danRows).bugsReported).toBe(1);
  });

  it("respects the activity window for assigned bugs", () => {
    const issues = [
      issue({ id: 5, tracker: "Bug", assignedTo: "Dev Dan", createdOn: "2026-02-01T00:00:00Z" }),
      issue({ id: 6, tracker: "Bug", assignedTo: "Dev Dan", createdOn: "2026-03-20T00:00:00Z" }),
    ];
    const rows = build(issues, [], { from: "2026-03-01", to: "2026-03-31" });
    expect(rowFor(rows, 5, "Dev Dan")).toBeUndefined();
    expect(rowFor(rows, 6, "Dev Dan")!.bugsReported).toBe(1);
  });

  it("ignores bugs with status Not a bug — for the developer, the QA and the CT count", () => {
    const ct = [{ id: 9, name: "Testing Type", value: ["CT"] }];
    const issues = [
      issue({ id: 1, assignedTo: "Dev Dan", assignedQAs: [qa("Quinn QA")] }),
      issue({ id: 2, parentId: 1, tracker: "Bug", author: "Quinn QA", status: "New", customFields: ct }),
      issue({ id: 3, parentId: 1, tracker: "Bug", author: "Quinn QA", status: "Not a bug", customFields: ct }),
      issue({ id: 4, parentId: 1, tracker: "Bug", author: "Quinn QA", status: "NOT A BUG" }),
      issue({ id: 5, parentId: 1, tracker: "Bug", author: "Quinn QA", status: "Not a Bug " }),
    ];
    const rows = build(issues);
    for (const name of ["Dev Dan", "Quinn QA"]) {
      const row = rowFor(rows, 1, name)!;
      expect(row.bugsReported).toBe(1);
      expect(row.ctBugs).toBe(1);
    }
  });

  it("still counts bugs with other closed statuses", () => {
    const issues = [
      issue({ id: 1, assignedTo: "Dev Dan" }),
      issue({ id: 2, parentId: 1, tracker: "Bug", status: "Closed", statusIsClosed: true }),
      issue({ id: 3, parentId: 1, tracker: "Bug", status: "Rejected" }),
    ];
    expect(rowFor(build(issues), 1, "Dev Dan")!.bugsReported).toBe(2);
  });

  it("an activity window does not change who counts as working on a ticket", () => {
    const issues = [
      issue({ id: 1, assignedTo: "Dev Dan" }),
      issue({ id: 2, parentId: 1, tracker: "Bug", author: "Quinn QA", createdOn: "2026-03-20T00:00:00Z" }),
    ];
    // Quinn's only time on the ticket was in February, outside the March window
    const rows = build(issues, [entry({ id: 1, issueId: 1, user: "Quinn QA", hours: 1, spentOn: "2026-02-10" })], {
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(rowFor(rows, 1, "Quinn QA")!.bugsReported).toBe(1);
  });

  it("counts CT bugs from the Testing Type custom field", () => {
    const issues = [
      issue({ id: 1, assignedTo: "Dev Dan" }),
      issue({ id: 2, parentId: 1, tracker: "Bug", customFields: [{ id: 9, name: "Testing Type", value: ["CT"] }] }),
      issue({ id: 3, parentId: 1, tracker: "Bug", customFields: [{ id: 9, name: "Testing Type", value: ["QA"] }] }),
      issue({ id: 4, parentId: 1, tracker: "Bug", customFields: [{ id: 9, name: "Testing Type", value: ["QA", "CT"] }] }),
      issue({ id: 5, parentId: 1, tracker: "Bug" }),
    ];
    const row = rowFor(build(issues), 1, "Dev Dan")!;
    expect(row.bugsReported).toBe(4);
    expect(row.ctBugs).toBe(2);
  });

  it("splits a ticket's estimate equally between its listed developers so totals reconcile", () => {
    const issues = [issue({ id: 1, assignedTo: "Dev Dan", additionalAssignees: [{ id: 7, name: "Dev Dee" }], estimatedHours: 10 })];
    const rows = build(issues);
    expect(rowFor(rows, 1, "Dev Dan")!.estimation).toBe(5);
    expect(rowFor(rows, 1, "Dev Dee")!.estimation).toBe(5);
  });

  it("does not split the developer estimate with people the list does not call Developers", () => {
    const issues = [issue({ id: 1, assignedTo: "Dev Dan", additionalAssignees: [{ id: 7, name: "Stranger" }], estimatedHours: 10 })];
    const rows = build(issues);
    expect(rowFor(rows, 1, "Dev Dan")!.estimation).toBe(10);
    expect(rowFor(rows, 1, "Stranger")!.estimation).toBeNull();
  });

  it("leaves Estimation null (not 0) when nothing was estimated", () => {
    expect(build([issue({ id: 1, assignedTo: "Dev Dan" })])[0].estimation).toBeNull();
  });

  it("keeps hours from someone not on the ticket and labels them by the list", () => {
    const issues = [issue({ id: 1, assignedTo: "Dev Dan" })];
    const entries = [
      entry({ id: 1, issueId: 1, user: "Quinn QA", hours: 2 }), // listed QA, not attached
      entry({ id: 2, issueId: 1, user: "Stranger", hours: 1 }), // not in the list
    ];
    const rows = build(issues, entries);
    expect(rowFor(rows, 1, "Quinn QA")).toMatchObject({ role: "QA", actuals: 2 });
    expect(rowFor(rows, 1, "Stranger")).toMatchObject({ role: "Unknown", actuals: 1 });
  });

  it("ignores tickets whose tracker is not a task tracker, but still rolls them up", () => {
    const issues = [
      issue({ id: 1, tracker: "Story", assignedTo: "Dev Dan" }),
      issue({ id: 2, parentId: 1, tracker: "Support", assignedTo: "Dev Dan" }),
    ];
    const rows = build(issues, [entry({ id: 1, issueId: 2, user: "Dev Dan", hours: 3 })]);
    expect(rows.map((r) => r.taskId)).toEqual([1]);
    expect(rows[0].actuals).toBe(3);
  });

  it("limits hours by spent-on date and bugs by created-on date, dropping empty rows", () => {
    const issues = [
      issue({ id: 1, assignedTo: "Dev Dan" }),
      issue({ id: 2, parentId: 1, tracker: "Bug", createdOn: "2026-02-01T00:00:00Z" }),
      issue({ id: 3, parentId: 1, tracker: "Bug", createdOn: "2026-03-20T00:00:00Z" }),
      issue({ id: 9, assignedTo: "Dev Dee" }),
    ];
    const entries = [
      entry({ id: 1, issueId: 1, user: "Dev Dan", hours: 2, spentOn: "2026-02-10" }),
      entry({ id: 2, issueId: 1, user: "Dev Dan", hours: 5, spentOn: "2026-03-10" }),
    ];
    const rows = build(issues, entries, { from: "2026-03-01", to: "2026-03-31" });
    const row = rowFor(rows, 1, "Dev Dan")!;
    expect(row.actuals).toBe(5);
    expect(row.bugsReported).toBe(1);
    expect(rowFor(rows, 9, "Dev Dee")).toBeUndefined();
  });

  it("always leaves Complexity and AI usage empty", () => {
    const rows = build([issue({ id: 1, assignedTo: "Dev Dan" })]);
    expect(rows[0].complexity).toBeNull();
    expect(rows[0].aiUsage).toBeNull();
  });

  it("does not loop forever on a corrupt parent cycle", () => {
    const issues = [
      issue({ id: 1, parentId: 2, assignedTo: "Dev Dan" }),
      issue({ id: 2, parentId: 1, assignedTo: "Dev Dan" }),
    ];
    expect(() => build(issues)).not.toThrow();
  });
});

describe("filter / group / sort", () => {
  const issues = [
    issue({ id: 1, project: "Alpha", assignedTo: "Dev Dan", statusIsClosed: true, status: "Closed" }),
    issue({ id: 2, project: "Beta", assignedTo: "Dev Dan", subject: "Login page" }),
    issue({ id: 3, project: "Beta", assignedTo: "Dev Dee" }),
  ];
  const entries = [
    entry({ id: 1, issueId: 1, user: "Dev Dan", hours: 1 }),
    entry({ id: 2, issueId: 2, user: "Dev Dan", hours: 4 }),
    entry({ id: 3, issueId: 3, user: "Dev Dee", hours: 2 }),
  ];
  const rows = build(issues, entries);

  it("filters by name, project, state and search text (name, subject or #id)", () => {
    expect(filterPerformanceRows(rows, { ...EMPTY_PERFORMANCE_FILTERS, names: ["Dev Dee"] })).toHaveLength(1);
    expect(filterPerformanceRows(rows, { ...EMPTY_PERFORMANCE_FILTERS, projects: ["Beta"] })).toHaveLength(2);
    expect(filterPerformanceRows(rows, { ...EMPTY_PERFORMANCE_FILTERS, state: "closed" })).toHaveLength(1);
    expect(filterPerformanceRows(rows, { ...EMPTY_PERFORMANCE_FILTERS, search: "login" })).toHaveLength(1);
    expect(filterPerformanceRows(rows, { ...EMPTY_PERFORMANCE_FILTERS, search: "#3" })).toHaveLength(1);
  });

  it("keeps only the selected people when several are chosen", () => {
    const both = filterPerformanceRows(rows, { ...EMPTY_PERFORMANCE_FILTERS, names: ["Dev Dan", "Dev Dee"] });
    expect(both).toHaveLength(3);
    const one = filterPerformanceRows(rows, { ...EMPTY_PERFORMANCE_FILTERS, names: ["Dev Dan"] });
    expect(one.map((r) => r.name)).toEqual(["Dev Dan", "Dev Dan"]);
    expect(one.reduce((sum, r) => sum + r.actuals, 0)).toBe(5);
  });

  it("groups with subtotals, nested by several keys, largest actuals first", () => {
    const groups = groupPerformanceRows(rows, ["name", "project"]);
    expect(groups.map((g) => [g.label, g.totals.actuals])).toEqual([["Dev Dan", 5], ["Dev Dee", 2]]);
    expect(groups[0].children.map((c) => [c.label, c.totals.actuals])).toEqual([["Beta", 4], ["Alpha", 1]]);
    expect(groups[0].children[0].rows).toHaveLength(1);
  });

  it("totals count a person's hours and bugs once when a task and its child are both listed", () => {
    const nested = build(
      [
        issue({ id: 1, tracker: "Epic", assignedTo: "Dev Dan" }),
        issue({ id: 2, parentId: 1, assignedTo: "Dev Dan", estimatedHours: 5 }),
        issue({ id: 3, parentId: 2, tracker: "Bug", author: "Quinn QA" }),
      ],
      [entry({ id: 1, issueId: 2, user: "Dev Dan", hours: 4 })]
    );
    const danRows = nested.filter((r) => r.name === "Dev Dan");
    expect(danRows).toHaveLength(2); // epic and story both listed
    const t = totalsOf(danRows);
    expect(t.rows).toBe(2);
    expect(t.actuals).toBe(4); // not 8
    expect(t.estimation).toBe(5); // not 10
    expect(t.bugsReported).toBe(1); // not 2
  });

  it("reports Estimation as null (not 0) when nothing in the set was estimated", () => {
    const rows = build([issue({ id: 1, assignedTo: "Dev Dan" })]);
    expect(totalsOf(rows).estimation).toBeNull();
  });

  it("counts the child when its parent has been filtered out of the set", () => {
    const nested = build(
      [issue({ id: 1, tracker: "Epic", assignedTo: "Dev Dan" }), issue({ id: 2, parentId: 1, assignedTo: "Dev Dan" })],
      [entry({ id: 1, issueId: 2, user: "Dev Dan", hours: 4 })]
    );
    const childOnly = nested.filter((r) => r.taskId === 2);
    expect(totalsOf(childOnly).actuals).toBe(4);
  });

  it("per-person group subtotals do not double count nested tasks", () => {
    const nested = build(
      [issue({ id: 1, tracker: "Epic", assignedTo: "Dev Dan" }), issue({ id: 2, parentId: 1, assignedTo: "Dev Dan" })],
      [entry({ id: 1, issueId: 2, user: "Dev Dan", hours: 4 })]
    );
    const groups = groupPerformanceRows(nested, ["name"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].totals.actuals).toBe(4);
  });

  it("sorts numerically and in both directions", () => {
    expect(sortPerformanceRows(rows, "actuals", "desc").map((r) => r.actuals)).toEqual([4, 2, 1]);
    expect(sortPerformanceRows(rows, "actuals", "asc").map((r) => r.actuals)).toEqual([1, 2, 4]);
  });
});

describe("bugLinkStats", () => {
  const ct = [{ id: 9, name: "Testing Type", value: ["CT"] }];

  it("separates bugs that sit under a task from those that cannot be credited to anyone", () => {
    const stats = bugLinkStats([
      issue({ id: 1, tracker: "Story" }),
      issue({ id: 2, parentId: 1, tracker: "Bug", customFields: ct }), // linked, CT
      issue({ id: 3, parentId: 1, tracker: "Bug" }), // linked
      issue({ id: 4, tracker: "Bug", customFields: ct }), // no parent, CT
      issue({ id: 5, tracker: "Test Case" }),
      issue({ id: 6, parentId: 5, tracker: "Bug" }), // only under a non-task ticket
    ]);
    expect(stats).toEqual({ bugs: 4, ctBugs: 2, unlinkedBugs: 2, unlinkedCtBugs: 1 });
  });

  it("treats a bug under a non-task ticket as linked when that ticket is itself under a task", () => {
    const stats = bugLinkStats([
      issue({ id: 1, tracker: "Epic" }),
      issue({ id: 2, parentId: 1, tracker: "Test Case" }),
      issue({ id: 3, parentId: 2, tracker: "Bug" }),
    ]);
    expect(stats.unlinkedBugs).toBe(0);
  });

  it("leaves Not a bug out of the totals", () => {
    const stats = bugLinkStats([
      issue({ id: 1, tracker: "Story" }),
      issue({ id: 2, parentId: 1, tracker: "Bug" }),
      issue({ id: 3, parentId: 1, tracker: "Bug", status: "Not a bug", customFields: ct }),
      issue({ id: 4, tracker: "Bug", status: "Not a bug" }),
    ]);
    expect(stats).toEqual({ bugs: 1, ctBugs: 0, unlinkedBugs: 0, unlinkedCtBugs: 0 });
  });

  it("does not loop on a parent cycle", () => {
    const stats = bugLinkStats([
      issue({ id: 1, parentId: 2, tracker: "Test Case" }),
      issue({ id: 2, parentId: 1, tracker: "Test Case" }),
      issue({ id: 3, parentId: 1, tracker: "Bug" }),
    ]);
    expect(stats.unlinkedBugs).toBe(1);
  });
});

describe("taskEstimate (the task's own estimate, the same on every row)", () => {
  it("is Redmine's total for the task, shown on every row whoever it is for", () => {
    const issues = [
      issue({ id: 1, tracker: "Epic", assignedTo: "Dev Dan", totalEstimatedHours: 40, estimatedHours: null }),
      issue({ id: 2, parentId: 1, assignedTo: "Dev Dee", estimatedHours: 25 }),
    ];
    const rows = build(issues, [entry({ id: 1, issueId: 1, user: "Quinn QA", hours: 1 })]);
    // everyone on the Epic sees the same 40 — including the person whose own share is blank
    expect(rowFor(rows, 1, "Dev Dan")!.taskEstimate).toBe(40);
    expect(rowFor(rows, 1, "Dev Dee")!.taskEstimate).toBe(40);
    expect(rowFor(rows, 1, "Quinn QA")!.taskEstimate).toBe(40);
    // while each person's own share stays their own
    expect(rowFor(rows, 1, "Dev Dan")!.estimation).toBeNull();
    expect(rowFor(rows, 1, "Dev Dee")!.estimation).toBe(25);
  });

  it("is what the ticket shows in Redmine even when the person it is assigned to is a listed QA", () => {
    // the assignee is a QA by the master list, so their own share comes from "Estimated time for QA"
    // (blank here) — but the ticket's 8h is still on screen
    const rows = build([issue({ id: 1, assignedTo: "Quinn QA", estimatedHours: 8, totalEstimatedHours: 8 })]);
    const row = rowFor(rows, 1, "Quinn QA")!;
    expect(row.estimation).toBeNull();
    expect(row.taskEstimate).toBe(8);
  });

  it("adds up the loaded tickets when Redmine sent no total", () => {
    const issues = [
      issue({ id: 1, tracker: "Epic", assignedTo: "Dev Dan", estimatedHours: 5 }),
      issue({ id: 2, parentId: 1, assignedTo: "Dev Dee", estimatedHours: 3 }),
      issue({ id: 3, parentId: 1, assignedTo: "Dev Dee", estimatedHours: 2.5 }),
    ];
    expect(rowFor(build(issues), 1, "Dev Dan")!.taskEstimate).toBe(10.5);
  });

  it("is blank when nothing under the task is estimated", () => {
    expect(rowFor(build([issue({ id: 1, assignedTo: "Dev Dan" })]), 1, "Dev Dan")!.taskEstimate).toBeNull();
  });

  it("is not added into totals and is sortable", () => {
    const rows = build([
      issue({ id: 1, assignedTo: "Dev Dan", estimatedHours: 2, totalEstimatedHours: 2 }),
      issue({ id: 2, assignedTo: "Dev Dee", estimatedHours: 9, totalEstimatedHours: 9 }),
    ]);
    expect(sortPerformanceRows(rows, "taskEstimate", "desc").map((r) => r.taskId)).toEqual([2, 1]);
    expect(Object.keys(totalsOf(rows))).not.toContain("taskEstimate");
  });
});
