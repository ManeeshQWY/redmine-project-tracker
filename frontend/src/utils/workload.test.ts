import { describe, expect, it } from "vitest";
import { Issue } from "../types/issue";
import { buildRoleLookup, EMPTY_PERFORMANCE_FILTERS, PerformanceFilters } from "./performance";
import { buildWorkload, projectPeople, summarizeWorkload } from "./workload";

function issue(overrides: Partial<Issue> & { id: number }): Issue {
  return {
    parentId: null, project: "Alpha", tracker: "Task", status: "New", statusIsClosed: false, priority: "Normal",
    author: "A", subject: `Ticket ${overrides.id}`, description: null, doneRatio: 0, createdOn: "2026-03-10T00:00:00Z",
    updatedOn: "2026-03-10T00:00:00Z", assignedTo: null, targetVersion: null, targetVersionId: null, startDate: null,
    dueDate: null, closedOn: null, estimatedHours: null, spentHours: null, totalSpentHours: null, totalEstimatedHours: null,
    assignedQA: null, platform: null, additionalAssignee: null, additionalAssignees: [], assignedQAs: [],
    estimatedTimeForQA: null, customFields: [],
    ...overrides,
  };
}

const roles = buildRoleLookup(["Dev Dan", "Dev Dee"], ["Quinn QA"]);
const none: PerformanceFilters = EMPTY_PERFORMANCE_FILTERS;
const build = (issues: Issue[], filters: Partial<PerformanceFilters> = {}, chips: string[] = [], known: string[] = []) =>
  buildWorkload(issues, roles, { ...none, ...filters }, chips, known);
const rowOf = (rows: ReturnType<typeof build>, name: string) => rows.find((r) => r.name === name);

describe("buildWorkload", () => {
  it("counts the open tickets of any type a person is on, split by status, with the bugs among them", () => {
    const rows = build([
      issue({ id: 1, assignedTo: "Dev Dan", status: "In Progress" }),
      issue({ id: 2, assignedTo: "Dev Dan", status: "In Progress", tracker: "Bug" }),
      issue({ id: 3, assignedTo: "Dev Dan", status: "New", tracker: "Epic" }),
    ]);
    const dan = rowOf(rows, "Dev Dan")!;
    expect(dan.open).toBe(3);
    expect(dan.bugs).toBe(1);
    expect(dan.byStatus).toEqual({ "In Progress": 2, New: 1 });
    expect(dan.role).toBe("Developer");
    expect(dan.tickets.map((t) => t.id)).toEqual([1, 2, 3]); // by status, then number
  });

  it("does not count closed tickets", () => {
    const rows = build([
      issue({ id: 1, assignedTo: "Dev Dan" }),
      issue({ id: 2, assignedTo: "Dev Dan", status: "Closed", statusIsClosed: true }),
    ]);
    expect(rowOf(rows, "Dev Dan")!.open).toBe(1);
  });

  it("counts a ticket for its Assignee, Additional Assignees and Assigned QAs alike", () => {
    const rows = build([
      issue({
        id: 1,
        assignedTo: "Dev Dan",
        additionalAssignees: [{ id: 2, name: "Dev Dee" }],
        assignedQAs: [{ id: 3, name: "Quinn QA" }],
      }),
    ]);
    expect(rows.map((r) => [r.name, r.open])).toEqual([["Dev Dan", 1], ["Dev Dee", 1], ["Quinn QA", 1]]);
    expect(rowOf(rows, "Quinn QA")!.role).toBe("QA");
  });

  it("counts a ticket once for a person who is on it in two ways", () => {
    const rows = build([issue({ id: 1, assignedTo: "Dev Dan", additionalAssignees: [{ id: 1, name: "Dev Dan" }] })]);
    expect(rowOf(rows, "Dev Dan")!.open).toBe(1);
  });

  it("lists known people with no open tickets as zero, and sorts the busiest first", () => {
    const rows = build(
      [issue({ id: 1, assignedTo: "Dev Dee" }), issue({ id: 2, assignedTo: "Dev Dee" }), issue({ id: 3, assignedTo: "Quinn QA" })],
      {},
      [],
      ["Dev Dan", "dev dee", "Quinn QA"]
    );
    expect(rows.map((r) => [r.name, r.open])).toEqual([["Dev Dee", 2], ["Quinn QA", 1], ["Dev Dan", 0]]);
    expect(rowOf(rows, "Dev Dan")).toMatchObject({ bugs: 0, byStatus: {}, tickets: [] });
  });

  it("shows people who are not in the master list as Unknown", () => {
    const rows = build([issue({ id: 1, assignedTo: "Stranger" })]);
    expect(rowOf(rows, "Stranger")!.role).toBe("Unknown");
  });

  it("narrows the people by Name and Role", () => {
    const issues = [issue({ id: 1, assignedTo: "Dev Dan" }), issue({ id: 2, assignedTo: "Quinn QA" })];
    const known = ["Dev Dan", "Dev Dee", "Quinn QA"];
    expect(build(issues, { names: ["Dev Dan"] }, [], known).map((r) => r.name)).toEqual(["Dev Dan"]);
    expect(build(issues, { roles: ["QA"] }, [], known).map((r) => r.name)).toEqual(["Quinn QA"]);
  });

  it("narrows the tickets by Project, Tracker, Status and Target Version", () => {
    const issues = [
      issue({ id: 1, assignedTo: "Dev Dan", project: "Alpha", tracker: "Bug", status: "New", targetVersion: "v1" }),
      issue({ id: 2, assignedTo: "Dev Dan", project: "Beta", tracker: "Task", status: "Testing" }),
    ];
    expect(rowOf(build(issues, { projects: ["Beta"] }), "Dev Dan")!.open).toBe(1);
    expect(rowOf(build(issues, { trackers: ["Bug"] }), "Dev Dan")!.tickets[0].id).toBe(1);
    expect(rowOf(build(issues, { statuses: ["Testing"] }), "Dev Dan")!.tickets[0].id).toBe(2);
    expect(rowOf(build(issues, { versions: ["(none)"] }), "Dev Dan")!.tickets[0].id).toBe(2);
    expect(rowOf(build(issues, {}, ["Bug"]), "Dev Dan")!.open).toBe(1); // the app-wide Tracker chips
  });

  it("ignores the open/closed filter, since this view is open tickets by definition", () => {
    const issues = [issue({ id: 1, assignedTo: "Dev Dan" })];
    expect(rowOf(build(issues, { state: "closed" }), "Dev Dan")!.open).toBe(1);
  });

  it("searches ticket subject or number, or a person's name", () => {
    const issues = [
      issue({ id: 11, assignedTo: "Dev Dan", subject: "Login page" }),
      issue({ id: 12, assignedTo: "Dev Dan", subject: "Reports" }),
      issue({ id: 13, assignedTo: "Dev Dee", subject: "Reports" }),
    ];
    const known = ["Dev Dan", "Dev Dee"];
    expect(rowOf(build(issues, { search: "login" }, [], known), "Dev Dan")!.open).toBe(1);
    expect(build(issues, { search: "login" }, [], known).map((r) => r.name)).toEqual(["Dev Dan"]); // nobody else matches
    expect(rowOf(build(issues, { search: "#13" }, [], known), "Dev Dee")!.open).toBe(1);
    expect(rowOf(build(issues, { search: "dev dan" }, [], known), "Dev Dan")!.open).toBe(2); // a name match keeps all their tickets
  });
});

describe("summarizeWorkload", () => {
  it("counts a ticket shared by two people once", () => {
    const rows = build([
      issue({ id: 1, assignedTo: "Dev Dan", additionalAssignees: [{ id: 2, name: "Dev Dee" }], tracker: "Bug" }),
      issue({ id: 2, assignedTo: "Dev Dan" }),
    ]);
    expect(summarizeWorkload(rows)).toEqual({ people: 2, tickets: 2, bugs: 1 });
  });
});

describe("projectPeople", () => {
  it("is everyone on a ticket, open or closed, or who logged time — each once", () => {
    const people = projectPeople(
      [
        issue({ id: 1, assignedTo: "Dev Dan", additionalAssignees: [{ id: 2, name: "Dev Dee" }] }),
        issue({ id: 2, assignedTo: "dev dan", status: "Closed", statusIsClosed: true, assignedQAs: [{ id: 3, name: "Quinn QA" }] }),
      ],
      [{ id: 1, project: "Alpha", issueId: 1, user: "Logger Lee", activity: "Dev", hours: 1, comments: null, spentOn: "2026-03-10" }]
    );
    expect(people.sort()).toEqual(["Dev Dan", "Dev Dee", "Logger Lee", "Quinn QA"]);
  });

  it("does not include anyone just because they are in the master list or authored a ticket", () => {
    expect(projectPeople([issue({ id: 1, author: "Some Customer" })], [])).toEqual([]);
  });
});

describe("remaining work and quietness", () => {
  const now = new Date("2026-03-20T12:00:00Z");
  const issues = [
    issue({ id: 1, tracker: "Epic", assignedTo: "Dev Dan", estimatedHours: 100, spentHours: 5, createdOn: "2026-01-01T00:00:00Z" }), // a parent: its hours are its children's
    issue({ id: 2, parentId: 1, assignedTo: "Dev Dan", estimatedHours: 10, spentHours: 4, updatedOn: "2026-03-01T00:00:00Z", createdOn: "2026-02-01T00:00:00Z" }),
    issue({ id: 3, parentId: 1, assignedTo: "Dev Dan", estimatedHours: 3, spentHours: 5, updatedOn: "2026-03-19T00:00:00Z" }), // overrun: nothing left
    issue({ id: 4, parentId: 1, assignedTo: "Dev Dan", updatedOn: "2026-03-18T00:00:00Z" }), // no estimate
  ];
  const dan = () => rowOf(build(issues, {}, [], [], now), "Dev Dan")!;

  function build(i: Issue[], f: Partial<PerformanceFilters>, c: string[], k: string[], n: Date) {
    return buildWorkload(i, roles, { ...none, ...f }, c, k, n);
  }

  it("adds up the hours left on leaf tickets only, never below zero, and counts the unestimated", () => {
    expect(dan().remainingHours).toBe(6); // 10 - 4 on #2, 0 on #3; the Epic's own 100 h is not added
    expect(dan().unestimated).toBe(1);
  });

  it("counts open leaf tickets with no update for more than a week", () => {
    expect(dan().quiet).toBe(1); // #2, updated 19 days ago
  });

  it("gives the age of the oldest open ticket, parents included", () => {
    expect(dan().oldestDays).toBe(78); // the Epic, created 1 Jan
  });

  it("is zero for someone with nothing open", () => {
    const row = rowOf(build([], {}, [], ["Dev Dee"], now), "Dev Dee")!;
    expect(row).toMatchObject({ remainingHours: 0, unestimated: 0, quiet: 0, oldestDays: null });
  });
});
