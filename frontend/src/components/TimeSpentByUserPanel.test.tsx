import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TimeSpentByUserPanel from "./TimeSpentByUserPanel";
import { Issue, TimeEntry } from "../types/issue";
import * as api from "../services/api";
import * as excelExport from "../utils/excelExport";

// Regression test for a hooks-order bug that shipped a real production crash: a
// useMemo was called after this component's early `if (timeEntries === null) return`,
// so the number of hooks React saw changed the moment "Load Time Data" resolved,
// crashing the whole component tree (blank screen, no error boundary to catch it).
// tsc doesn't catch this class of bug — only actually mounting and interacting with
// the component (or eslint's react-hooks/rules-of-hooks) does.

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 1,
    parentId: null,
    project: "P",
    tracker: "Bug",
    status: "New",
    statusIsClosed: false,
    priority: "Normal",
    author: "A",
    subject: "Subject",
    description: null,
    doneRatio: 0,
    createdOn: "2026-01-01T00:00:00Z",
    updatedOn: "2026-01-01T00:00:00Z",
    assignedTo: null,
    targetVersion: null,
    startDate: null,
    dueDate: null,
    closedOn: null,
    estimatedHours: null,
    spentHours: null,
    totalSpentHours: null,
    totalEstimatedHours: null,
    assignedQA: null,
    platform: null,
    additionalAssignee: null,
    additionalAssignees: [],
    estimatedTimeForQA: null,
    customFields: [],
    ...overrides,
  };
}

function makeTimeEntry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return { id: 1, project: "P", issueId: 1, user: "Alice", activity: "Development", hours: 1, comments: null, spentOn: "2026-01-01", ...overrides };
}

// The panel renders two tables: the per-user summary (always first) and the Monthly
// Breakdown (always second, and it reuses user names as its own column headers) — so
// a plain screen.getByText("SomeUser") is ambiguous once both tables are on screen.
// These helpers scope queries to the right one explicitly.
function summaryTable() {
  return screen.getAllByRole("table")[0];
}
function breakdownTable() {
  return screen.getAllByRole("table")[1];
}

describe("TimeSpentByUserPanel", () => {
  it("renders the table after Load Time Data resolves, without crashing", async () => {
    vi.spyOn(api, "getTimeEntries").mockResolvedValue({
      timeEntries: [makeTimeEntry({ user: "Rangeen Suresh", hours: 90 })],
      totalCount: 1,
      durationMs: 5,
      fetchedAt: "2026-01-01T00:00:00Z",
    });

    render(<TimeSpentByUserPanel projectIdentifier="qdesk" projectLabel="QDesk" issues={[makeIssue()]} onSessionExpired={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /load time data/i }));

    await waitFor(() => expect(within(summaryTable()).getByText("Rangeen Suresh")).toBeInTheDocument());
    expect(screen.getByText(/90(\.0)?h total/)).toBeInTheDocument();
  });

  it("rolls up child-ticket time when filtering by a parent ticket id", async () => {
    vi.spyOn(api, "getTimeEntries").mockResolvedValue({
      timeEntries: [
        makeTimeEntry({ id: 1, issueId: 25200, user: "Rangeen Suresh", hours: 90 }),
        makeTimeEntry({ id: 2, issueId: 999, user: "Someone Else", hours: 50 }),
      ],
      totalCount: 2,
      durationMs: 5,
      fetchedAt: "2026-01-01T00:00:00Z",
    });
    const issues = [makeIssue({ id: 25132, tracker: "Epic" }), makeIssue({ id: 25200, tracker: "Task", parentId: 25132 })];

    render(<TimeSpentByUserPanel projectIdentifier="qdesk" projectLabel="QDesk" issues={issues} onSessionExpired={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /load time data/i }));
    await waitFor(() => expect(screen.getByLabelText(/ticket id/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/ticket id/i), { target: { value: "25132" } });

    await waitFor(() => expect(within(summaryTable()).getByText("Rangeen Suresh")).toBeInTheDocument());
    expect(within(summaryTable()).queryByText("Someone Else")).not.toBeInTheDocument();
  });

  it("Month filter narrows the summary table to one month, defaulting to All Months", async () => {
    vi.spyOn(api, "getTimeEntries").mockResolvedValue({
      timeEntries: [
        makeTimeEntry({ id: 1, user: "Alice", hours: 10, spentOn: "2026-01-15" }),
        makeTimeEntry({ id: 2, user: "Bob", hours: 20, spentOn: "2026-02-10" }),
      ],
      totalCount: 2,
      durationMs: 5,
      fetchedAt: "2026-01-01T00:00:00Z",
    });

    render(<TimeSpentByUserPanel projectIdentifier="qdesk" projectLabel="QDesk" issues={[makeIssue()]} onSessionExpired={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /load time data/i }));

    // Default ("All Months") shows both users in the summary table.
    await waitFor(() => expect(within(summaryTable()).getByText("Alice")).toBeInTheDocument());
    expect(within(summaryTable()).getByText("Bob")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^month$/i), { target: { value: "2026-01" } });

    await waitFor(() => expect(within(summaryTable()).queryByText("Bob")).not.toBeInTheDocument());
    expect(within(summaryTable()).getByText("Alice")).toBeInTheDocument();
  });

  it("Monthly Breakdown table shows every month regardless of the Month filter", async () => {
    vi.spyOn(api, "getTimeEntries").mockResolvedValue({
      timeEntries: [
        makeTimeEntry({ id: 1, user: "Alice", hours: 10, spentOn: "2026-01-15" }),
        makeTimeEntry({ id: 2, user: "Alice", hours: 20, spentOn: "2026-02-10" }),
      ],
      totalCount: 2,
      durationMs: 5,
      fetchedAt: "2026-01-01T00:00:00Z",
    });

    render(<TimeSpentByUserPanel projectIdentifier="qdesk" projectLabel="QDesk" issues={[makeIssue()]} onSessionExpired={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /load time data/i }));
    await waitFor(() => expect(screen.getByText("Monthly Breakdown")).toBeInTheDocument());

    // Narrowing the Month filter should NOT collapse the breakdown table's own months.
    fireEvent.change(screen.getByLabelText(/^month$/i), { target: { value: "2026-01" } });

    await waitFor(() => expect(within(breakdownTable()).getByText("Jan 2026")).toBeInTheDocument());
    expect(within(breakdownTable()).getByText("Feb 2026")).toBeInTheDocument();
  });

  it("Export to Excel calls exportTimeSpentToExcel with the current rows", async () => {
    vi.spyOn(api, "getTimeEntries").mockResolvedValue({
      timeEntries: [makeTimeEntry({ user: "Alice", hours: 10, spentOn: "2026-01-15" })],
      totalCount: 1,
      durationMs: 5,
      fetchedAt: "2026-01-01T00:00:00Z",
    });
    const exportSpy = vi.spyOn(excelExport, "exportTimeSpentToExcel").mockResolvedValue(undefined);

    render(<TimeSpentByUserPanel projectIdentifier="qdesk" projectLabel="QDesk" issues={[makeIssue()]} onSessionExpired={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /load time data/i }));
    await waitFor(() => expect(within(summaryTable()).getByText("Alice")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /export to excel/i }));

    await waitFor(() => expect(exportSpy).toHaveBeenCalledTimes(1));
    const [userRows, monthRows] = exportSpy.mock.calls[0];
    expect(userRows[0].user).toBe("Alice");
    expect(monthRows[0].monthLabel).toBe("Jan 2026");
  });
});
