import { Issue, TimeEntry } from "../types/issue";

// Shared fixtures for tests: a fully populated Issue / TimeEntry with only the interesting
// fields overridden.

export function makeIssue(overrides: Partial<Issue> & { id: number }): Issue {
  return {
    parentId: null, project: "Alpha", tracker: "Task", status: "New", statusIsClosed: false, priority: "Normal",
    author: "Author", subject: `Ticket ${overrides.id}`, description: null, doneRatio: 0,
    createdOn: "2026-03-01T00:00:00Z", updatedOn: "2026-03-01T00:00:00Z", assignedTo: null, targetVersion: null,
    targetVersionId: null, startDate: null, dueDate: null, closedOn: null, estimatedHours: null, spentHours: null,
    totalSpentHours: null, totalEstimatedHours: null, assignedQA: null, platform: null, additionalAssignee: null,
    additionalAssignees: [], assignedQAs: [], estimatedTimeForQA: null, customFields: [],
    ...overrides,
  };
}

export function makeEntry(overrides: Partial<TimeEntry> & { id: number }): TimeEntry {
  return { project: "Alpha", issueId: 1, user: "Dev Dan", activity: "Development", hours: 1, comments: null, spentOn: "2026-03-10", ...overrides };
}
