import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TimeSpentByUserPanel from "./TimeSpentByUserPanel";
import { Issue, TimeEntry } from "../types/issue";
import * as api from "../services/api";

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

describe("TimeSpentByUserPanel", () => {
  it("renders the table after Load Time Data resolves, without crashing", async () => {
    vi.spyOn(api, "getTimeEntries").mockResolvedValue({
      timeEntries: [makeTimeEntry({ user: "Rangeen Suresh", hours: 90 })],
      totalCount: 1,
      durationMs: 5,
      fetchedAt: "2026-01-01T00:00:00Z",
    });

    render(<TimeSpentByUserPanel projectIdentifier="qdesk" issues={[makeIssue()]} onSessionExpired={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /load time data/i }));

    await waitFor(() => expect(screen.getByText("Rangeen Suresh")).toBeInTheDocument());
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

    render(<TimeSpentByUserPanel projectIdentifier="qdesk" issues={issues} onSessionExpired={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /load time data/i }));
    await waitFor(() => expect(screen.getByLabelText(/ticket id/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/ticket id/i), { target: { value: "25132" } });

    await waitFor(() => expect(screen.getByText("Rangeen Suresh")).toBeInTheDocument());
    expect(screen.queryByText("Someone Else")).not.toBeInTheDocument();
  });
});
