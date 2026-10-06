import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ReleaseDashboard from "./ReleaseDashboard";
import { Issue } from "../types/issue";
import * as api from "../services/api";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 1, parentId: null, project: "P", tracker: "Bug", status: "New", statusIsClosed: false, priority: "Normal",
    author: "A", subject: "S", description: null, doneRatio: 0, createdOn: "2026-01-01T00:00:00Z", updatedOn: "2026-01-01T00:00:00Z",
    assignedTo: null, targetVersion: null, targetVersionId: null, startDate: null, dueDate: null, closedOn: null,
    estimatedHours: null, spentHours: null, totalSpentHours: null, totalEstimatedHours: null, assignedQA: null, platform: null,
    additionalAssignee: null, additionalAssignees: [], estimatedTimeForQA: null, customFields: [],
    ...overrides,
  };
}

describe("ReleaseDashboard release dates", () => {
  it("shows each release's date, and a dash for a version with no date or no version", async () => {
    vi.spyOn(api, "getVersions").mockResolvedValue([
      { id: 7, name: "Sprint 7", dueDate: "2026-03-31", status: "closed" },
      { id: 8, name: "Sprint 8", dueDate: null, status: "open" },
    ]);
    const issues = [
      makeIssue({ id: 1, targetVersion: "Sprint 7", targetVersionId: 7 }),
      makeIssue({ id: 2, targetVersion: "Sprint 8", targetVersionId: 8 }),
      makeIssue({ id: 3 }),
    ];

    render(<ReleaseDashboard issues={issues} projectIdentifier="p" />);

    await waitFor(() => expect(screen.getByText("31 Mar 2026")).toBeInTheDocument());
    const row = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;
    expect(within(row("Sprint 8")).getByText("—")).toBeInTheDocument();
    expect(within(row("No Target Version")).getByText("—")).toBeInTheDocument();
  });

  it("still renders the table (without dates) when the dates can't be loaded", async () => {
    vi.spyOn(api, "getVersions").mockRejectedValue(new Error("boom"));
    render(<ReleaseDashboard issues={[makeIssue({ targetVersion: "Sprint 7", targetVersionId: 7 })]} projectIdentifier="p" />);

    await waitFor(() => expect(screen.getByText(/release dates couldn.t be loaded/i)).toBeInTheDocument());
    expect(screen.getByText("Sprint 7")).toBeInTheDocument();
  });
});
