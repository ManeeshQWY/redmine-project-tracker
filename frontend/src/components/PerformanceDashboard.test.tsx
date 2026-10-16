import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PerformanceDashboard from "./PerformanceDashboard";
import { Issue, TimeEntry, UserRolesResult } from "../types/issue";
import * as api from "../services/api";
import * as excelExport from "../utils/excelExport";

// Mounting + interacting is what catches the hooks-order crash class that tsc cannot —
// the "load" early return sits above a lot of derived state in this component.

function makeIssue(overrides: Partial<Issue> & { id: number }): Issue {
  return {
    parentId: null, project: "Alpha", tracker: "Story", status: "New", statusIsClosed: false, priority: "Normal",
    author: "Author", subject: `Ticket ${overrides.id}`, description: null, doneRatio: 0,
    createdOn: "2026-03-01T00:00:00Z", updatedOn: "2026-03-01T00:00:00Z", assignedTo: null, targetVersion: null,
    targetVersionId: null, startDate: null, dueDate: null, closedOn: null, estimatedHours: null, spentHours: null,
    totalSpentHours: null, totalEstimatedHours: null, assignedQA: null, platform: null, additionalAssignee: null,
    additionalAssignees: [], assignedQAs: [], estimatedTimeForQA: null, customFields: [],
    ...overrides,
  };
}

function makeEntry(overrides: Partial<TimeEntry> & { id: number }): TimeEntry {
  return { project: "Alpha", issueId: 1, user: "Dev Dan", activity: "Dev", hours: 1, comments: null, spentOn: "2026-03-10", ...overrides };
}

const ISSUES = [
  makeIssue({ id: 1, subject: "Login page", assignedTo: "Dev Dan", estimatedHours: 8, assignedQAs: [{ id: 5, name: "Quinn QA" }], estimatedTimeForQA: "3" }),
  makeIssue({ id: 2, subject: "Reports", assignedTo: "Dev Dee", estimatedHours: 4 }),
  makeIssue({ id: 3, parentId: 1, tracker: "Bug", author: "Quinn QA", customFields: [{ id: 9, name: "Testing Type", value: ["CT"] }] }),
];
const ENTRIES = [
  makeEntry({ id: 1, issueId: 1, user: "Dev Dan", hours: 6 }),
  makeEntry({ id: 2, issueId: 1, user: "Quinn QA", hours: 2 }),
  makeEntry({ id: 3, issueId: 2, user: "Dev Dee", hours: 1 }),
];

// The master Developer/QA list the backend would serve from user_roles.json.
const MASTER: UserRolesResult = { developers: ["Dev Dan", "Dev Dee"], qa: ["Quinn QA"], conflicts: [], error: null };

async function renderLoaded(
  issues: Issue[] = ISSUES,
  entries: TimeEntry[] = ENTRIES,
  roles: UserRolesResult = MASTER,
  trackers: string[] = []
) {
  vi.spyOn(api, "getTimeEntries").mockResolvedValue({
    timeEntries: entries, totalCount: entries.length, durationMs: 1, fetchedAt: "2026-03-20T00:00:00Z",
  });
  vi.spyOn(api, "getUserRoles").mockResolvedValue(roles);
  render(
    <PerformanceDashboard projectIdentifier="alpha" projectLabel="Alpha" redmineBaseUrl="https://r.test" issues={issues} trackers={trackers} onSessionExpired={() => {}} />
  );
  fireEvent.click(screen.getByRole("button", { name: /load performance data/i }));
  await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
}

const dataTable = () => screen.getByRole("table");
const apply = () => fireEvent.click(screen.getByRole("button", { name: "Apply" }));
const openPeople = () => fireEvent.click(screen.getByRole("button", { name: /all people|selected/i }));
// tbody rows only — the header and the totals footer are rows too.
const bodyRows = () => within(dataTable()).getAllByRole("row").filter((r) => r.parentElement?.tagName === "TBODY");

afterEach(() => vi.restoreAllMocks());

describe("PerformanceDashboard", () => {
  it("loads on demand and shows one row per person per task, without crashing", async () => {
    await renderLoaded();
    const text = dataTable().textContent ?? "";
    expect(text).toContain("Dev Dan");
    expect(text).toContain("Quinn QA");
    expect(text).toContain("Dev Dee");
    // the Bug ticket (#3) is a task row too, so it contributes its own people
    // #1 appears once per person on it (Dev Dan and Quinn QA)
    const links = screen.getAllByRole("link", { name: "#1" });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "https://r.test/issues/1");
  });

  it("shows Dev Dan's consolidated numbers: 6h actual vs 8h estimated, 1 bug, 1 CT", async () => {
    await renderLoaded();
    const row = bodyRows().find((r) => r.textContent?.includes("Dev Dan") && r.textContent?.includes("#1"))!;
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    // Name, Role, Project, Task, Complexity, Estimation, Actuals, AI usage, Bugs, CT
    expect(cells[0]).toBe("Dev Dan");
    expect(cells[1]).toBe("Developer");
    expect(cells[5]).toBe("8");
    expect(cells[6]).toBe("6");
    expect(cells[8]).toBe("1");
    expect(cells[9]).toBe("1");
  });

  it("adds a filter facet, narrows the rows, and removes it again", async () => {
    await renderLoaded();
    const before = bodyRows().length;

    fireEvent.change(screen.getByLabelText("Add filter"), { target: { value: "roles" } });
    fireEvent.change(screen.getByLabelText("Filter value"), { target: { value: "QA" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    apply();

    await waitFor(() => expect(bodyRows().length).toBeLessThan(before));
    expect(dataTable().textContent).not.toContain("Dev Dee");

    fireEvent.click(screen.getByRole("button", { name: /remove role qa/i }));
    apply();
    await waitFor(() => expect(bodyRows().length).toBe(before));
  });

  it("does not change the table until Apply is clicked", async () => {
    await renderLoaded();
    const before = bodyRows().length;
    const apply = screen.getByRole("button", { name: "Apply" });
    expect(apply).toBeDisabled(); // nothing pending

    fireEvent.change(screen.getByLabelText("Add filter"), { target: { value: "roles" } });
    fireEvent.change(screen.getByLabelText("Filter value"), { target: { value: "QA" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    // staged: chip shown, hint shown, table untouched
    expect(screen.getByRole("button", { name: /remove role qa/i })).toBeInTheDocument();
    expect(screen.getByText(/aren't applied yet/i)).toBeInTheDocument();
    expect(bodyRows().length).toBe(before);
    expect(apply).toBeEnabled();

    fireEvent.click(apply);
    await waitFor(() => expect(bodyRows().length).toBeLessThan(before));
    expect(screen.queryByText(/aren't applied yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("Enter in the search box applies the filters", async () => {
    await renderLoaded();
    const search = screen.getByLabelText(/search \(name/i);
    fireEvent.change(search, { target: { value: "Dev Dee" } });
    expect(bodyRows().length).toBeGreaterThan(1); // not yet applied
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(bodyRows().length).toBe(1));
  });

  it("Clear filters resets both the staged and the applied filters", async () => {
    await renderLoaded();
    const before = bodyRows().length;
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/search \(name/i), { target: { value: "Dev Dee" } });
    apply();
    await waitFor(() => expect(bodyRows().length).toBe(1));

    // also stage something that is not applied
    fireEvent.change(screen.getByLabelText("Ticket state"), { target: { value: "closed" } });

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(bodyRows().length).toBe(before));
    expect((screen.getByLabelText(/search \(name/i) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Ticket state") as HTMLSelectElement).value).toBe("all");
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("offers only the people who remain after the other pending filters (cascading)", async () => {
    const issues = [
      makeIssue({ id: 1, project: "Alpha", assignedTo: "Dev Dan" }),
      makeIssue({ id: 2, project: "Beta", assignedTo: "Dev Dee" }),
    ];
    await renderLoaded(issues, [], MASTER);

    openPeople();
    expect(screen.getByRole("checkbox", { name: /^Dev Dan/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /^Dev Dee/ })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    // stage Project = Alpha — not applied yet, but the People list should already narrow
    fireEvent.change(screen.getByLabelText("Add filter"), { target: { value: "projects" } });
    fireEvent.change(screen.getByLabelText("Filter value"), { target: { value: "Alpha" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    openPeople();
    expect(screen.getByRole("checkbox", { name: /^Dev Dan/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /^Dev Dee/ })).not.toBeInTheDocument();
  });

  it("applying a Project filter shows only that project's people", async () => {
    const issues = [
      makeIssue({ id: 1, project: "Alpha", assignedTo: "Dev Dan" }),
      makeIssue({ id: 2, project: "Beta", assignedTo: "Dev Dee" }),
    ];
    await renderLoaded(issues, [], MASTER);
    fireEvent.change(screen.getByLabelText("Add filter"), { target: { value: "projects" } });
    fireEvent.change(screen.getByLabelText("Filter value"), { target: { value: "Alpha" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    apply();

    await waitFor(() => expect(bodyRows().length).toBe(1));
    expect(dataTable().textContent).toContain("Dev Dan");
    expect(dataTable().textContent).not.toContain("Dev Dee");
  });

  it("groups by name with subtotals and expands a group on click", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByLabelText("Group by"), { target: { value: "name" } });

    const dan = await waitFor(() => {
      const r = bodyRows().find((row) => row.textContent?.includes("Dev Dan"));
      expect(r).toBeTruthy();
      return r!;
    });
    expect(within(dan).getAllByRole("cell")[6].textContent).toBe("6"); // subtotal of Actuals
    expect(screen.queryByRole("link", { name: "#1" })).not.toBeInTheDocument(); // collapsed

    fireEvent.click(dan);
    await waitFor(() => expect(screen.getByRole("link", { name: "#1" })).toBeInTheDocument());
  });

  it("People multi-select keeps only the chosen users' data, and Clear brings everyone back", async () => {
    await renderLoaded();
    const all = bodyRows().length;

    openPeople();
    // each checkbox's label is "<name><role>", hence the anchored patterns
    fireEvent.click(screen.getByRole("checkbox", { name: /^Dev Dan/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^Quinn QA/ }));
    apply();

    await waitFor(() => expect(bodyRows().length).toBeLessThan(all));
    const text = dataTable().textContent ?? "";
    expect(text).toContain("Dev Dan");
    expect(text).toContain("Quinn QA");
    expect(text).not.toContain("Dev Dee");
    expect(screen.getByText("2 selected ▾")).toBeInTheDocument();

    // the dropdown is still open (Apply is not an outside mousedown)
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    apply();
    await waitFor(() => expect(bodyRows().length).toBe(all));
  });

  it("closes the People dropdown on an outside click and on Escape", async () => {
    await renderLoaded();
    openPeople();
    expect(screen.getByLabelText("Search people")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByLabelText("Search people")).not.toBeInTheDocument());

    openPeople();
    expect(screen.getByLabelText("Search people")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("Search people")).not.toBeInTheDocument());
  });

  it("keeps the dropdown open while interacting inside it", async () => {
    await renderLoaded();
    openPeople();
    fireEvent.mouseDown(screen.getByLabelText("Search people"));
    expect(screen.getByLabelText("Search people")).toBeInTheDocument();
  });

  it("'Counts by person' groups by name, collapsed, with per-person totals", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Counts by person" }));
    await waitFor(() => {
      const dan = bodyRows().find((r) => r.textContent?.includes("Dev Dan"));
      expect(dan).toBeTruthy();
    });
    expect(screen.queryByRole("link", { name: "#1" })).not.toBeInTheDocument(); // collapsed
    const dan = bodyRows().find((r) => r.textContent?.includes("Dev Dan"))!;
    expect(within(dan).getAllByRole("cell")[6].textContent).toBe("6");
  });

  it("shows bugs against a ticket even when nobody is in the master list yet", async () => {
    await renderLoaded(ISSUES, ENTRIES, { developers: [], qa: [], conflicts: [], error: null });
    const row = bodyRows().find((r) => r.textContent?.includes("Dev Dan") && r.textContent?.includes("#1"))!;
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    expect(cells[1]).toBe("Unknown");
    expect(cells[8]).toBe("1"); // the bug under #1
    expect(cells[9]).toBe("1"); // and it is a CT bug
  });

  it("People multi-select can be searched and 'Select shown' picks just the matches", async () => {
    await renderLoaded();
    openPeople();
    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "dev" } });
    expect(screen.queryByRole("checkbox", { name: /^Quinn QA/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select shown" }));
    apply();
    await waitFor(() => expect(dataTable().textContent).not.toContain("Quinn QA"));
    expect(dataTable().textContent).toContain("Dev Dan");
    expect(dataTable().textContent).toContain("Dev Dee");
  });

  it("shows each person's role from the master list, not from the ticket fields", async () => {
    const issues = [makeIssue({ id: 1, assignedTo: "Quinn QA", estimatedHours: 8, estimatedTimeForQA: "3" })];
    await renderLoaded(issues, []);
    const row = bodyRows().find((r) => r.textContent?.includes("Quinn QA"))!;
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    expect(cells[1]).toBe("QA"); // Assignee field, but the list says QA
    expect(cells[5]).toBe("3");
  });

  it("flags people who are not in the master list", async () => {
    const issues = [...ISSUES, makeIssue({ id: 9, assignedTo: "Newcomer Nia" })];
    await renderLoaded(issues);
    const notice = screen.getByText(/not in the master list/i);
    expect(notice.textContent).toContain("Newcomer Nia");
  });

  it("says so when the master list is empty or broken", async () => {
    await renderLoaded(ISSUES, ENTRIES, { developers: [], qa: [], conflicts: [], error: null });
    expect(screen.getByText(/master list is empty/i)).toBeInTheDocument();
  });

  it("shows estimates against not-yet-listed assignees and a dash when nothing is estimated", async () => {
    const issues = [makeIssue({ id: 1, assignedTo: "Newcomer Nia", estimatedHours: 6 }), makeIssue({ id: 2, assignedTo: "Other Olu" })];
    await renderLoaded(issues, [], { developers: [], qa: [], conflicts: [], error: null });
    const nia = bodyRows().find((r) => r.textContent?.includes("Newcomer Nia"))!;
    expect(within(nia).getAllByRole("cell")[5].textContent).toBe("6");
    const olu = bodyRows().find((r) => r.textContent?.includes("Other Olu"))!;
    expect(within(olu).getAllByRole("cell")[5].textContent).toBe("—");
  });

  it("copies a starter user_roles.json with everyone unclassified", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await renderLoaded(ISSUES, ENTRIES, { developers: [], qa: [], conflicts: [], error: null });

    fireEvent.click(screen.getByRole("button", { name: /copy starter file/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const written = JSON.parse(writeText.mock.calls[0][0]);
    expect(written.Developer).toEqual([]);
    expect(written.QA).toEqual([]);
    expect(written._unclassified).toEqual(expect.arrayContaining(["Dev Dan", "Dev Dee", "Quinn QA"]));
  });

  it("shows the file error when the master list cannot be read", async () => {
    await renderLoaded(ISSUES, ENTRIES, {
      developers: [], qa: [], conflicts: [], error: "user_roles.json could not be read: bad json",
    });
    expect(screen.getByText(/could not be read: bad json/i)).toBeInTheDocument();
  });

  it("can hide a column through the column picker", async () => {
    await renderLoaded();
    expect(within(dataTable()).getByRole("button", { name: /bugs reported/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^columns/i }));
    fireEvent.click(screen.getByLabelText("Bugs reported", { selector: "input" }));
    await waitFor(() => expect(within(dataTable()).queryByRole("button", { name: /bugs reported/i })).not.toBeInTheDocument());
  });

  it("exports the filtered, sorted rows", async () => {
    const exporter = vi.spyOn(excelExport, "exportPerformanceToExcel").mockResolvedValue();
    await renderLoaded();

    fireEvent.change(screen.getByLabelText(/search \(name/i), { target: { value: "Dev Dee" } });
    apply();
    await waitFor(() => expect(bodyRows().length).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: /export to excel/i }));

    await waitFor(() => expect(exporter).toHaveBeenCalledTimes(1));
    const [rows, project] = exporter.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Dev Dee");
    expect(project).toBe("Alpha");
  });

  it("says so when the project has no Developer/QA activity", async () => {
    await renderLoaded([makeIssue({ id: 1, tracker: "Support" })], []);
    expect(screen.getByText(/no developer\/qa activity/i)).toBeInTheDocument();
  });
});

describe("PerformanceDashboard export", () => {
  it("exports only the rows shown after Apply — the people and project that were filtered — in the performance layout", async () => {
    const exporter = vi.spyOn(excelExport, "exportPerformanceToExcel").mockResolvedValue();
    const issues = [
      makeIssue({ id: 1, project: "Alpha", assignedTo: "Dev Dan" }),
      makeIssue({ id: 2, project: "Beta", assignedTo: "Dev Dee" }),
      makeIssue({ id: 3, project: "Alpha", assignedTo: "Dev Dee" }),
    ];
    await renderLoaded(issues, [], MASTER);
    expect(screen.getByRole("button", { name: /export to excel \(3 rows\)/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Add filter"), { target: { value: "projects" } });
    fireEvent.change(screen.getByLabelText("Filter value"), { target: { value: "Alpha" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /export to excel \(2 rows\)/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /export to excel/i }));
    await waitFor(() => expect(exporter).toHaveBeenCalledTimes(1));
    const rows = exporter.mock.calls[0][0];
    expect(rows.map((r) => `${r.taskId}:${r.name}`).sort()).toEqual(["1:Dev Dan", "3:Dev Dee"]);
  });

  it("does not export filter changes that have not been applied", async () => {
    const exporter = vi.spyOn(excelExport, "exportPerformanceToExcel").mockResolvedValue();
    await renderLoaded();
    const total = bodyRows().length;

    fireEvent.change(screen.getByLabelText(/search \(name/i), { target: { value: "Dev Dee" } }); // staged only
    fireEvent.click(screen.getByRole("button", { name: /export to excel/i }));

    await waitFor(() => expect(exporter).toHaveBeenCalledTimes(1));
    expect(exporter.mock.calls[0][0]).toHaveLength(total);
  });
});

describe("PerformanceDashboard app-wide Tracker chips", () => {
  const issues = [
    makeIssue({ id: 1, tracker: "Story", assignedTo: "Dev Dan" }),
    makeIssue({ id: 2, tracker: "Bug", assignedTo: "Dev Dee" }),
    makeIssue({ id: 3, tracker: "Epic", assignedTo: "Dev Dan" }),
  ];

  it("shows rows only for the selected trackers, and the count reflects it", async () => {
    await renderLoaded(issues, [], MASTER, ["Bug"]);
    expect(bodyRows()).toHaveLength(1);
    expect(dataTable().textContent).toContain("Dev Dee");
    expect(dataTable().textContent).not.toContain("Dev Dan");
    expect(screen.getByText(/1 of 1 rows/)).toBeInTheDocument();
  });

  it("shows every task tracker when no chip is selected", async () => {
    await renderLoaded(issues, [], MASTER, []);
    expect(bodyRows()).toHaveLength(3);
  });

  it("offers only people who have rows under the selected tracker", async () => {
    await renderLoaded(issues, [], MASTER, ["Bug"]);
    openPeople();
    expect(screen.getByRole("checkbox", { name: /^Dev Dee/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /^Dev Dan/ })).not.toBeInTheDocument();
  });

  it("explains an empty result for a tracker that is not a task type", async () => {
    await renderLoaded(issues, [], MASTER, ["Test Case"]);
    expect(screen.getByText(/Tracker chips at the top leave no rows/i)).toBeInTheDocument();
  });

  it("does not offer Tracker a second time in Add filter", async () => {
    await renderLoaded();
    const options = within(screen.getByLabelText("Add filter")).getAllByRole("option").map((o) => o.textContent);
    expect(options).not.toContain("Tracker");
    expect(options).toContain("Project");
  });
});

describe("PerformanceDashboard bug-link summary", () => {
  it("states how many bugs (and CT bugs) cannot be credited because they are not under a task", async () => {
    const ctField = [{ id: 9, name: "Testing Type", value: ["CT"] }];
    const issues = [
      makeIssue({ id: 1, tracker: "Story", assignedTo: "Dev Dan" }),
      makeIssue({ id: 2, parentId: 1, tracker: "Bug", customFields: ctField }),
      makeIssue({ id: 3, tracker: "Bug", customFields: ctField }), // orphan CT bug
    ];
    await renderLoaded(issues, [], MASTER);
    const note = screen.getByText(/This project has 2 bugs \(2 CT\)/);
    expect(note.textContent).toContain("1 (1 CT) are not under any task");
  });
});
