// Mirrors backend/src/types/issue.ts — the frontend only ever talks to our own
// backend (never Redmine directly), so this is the shape returned by /api/*.

export interface CustomFieldValue {
  id: number;
  name: string;
  value: string | string[] | null;
}

export interface AssigneeRef {
  id: number;
  name: string;
}

export interface Issue {
  id: number;
  project: string;
  tracker: string;
  status: string;
  statusIsClosed: boolean;
  priority: string;
  author: string;
  subject: string;
  description: string | null;
  doneRatio: number;
  createdOn: string;
  updatedOn: string;
  assignedTo: string | null;
  targetVersion: string | null;
  startDate: string | null;
  dueDate: string | null;
  closedOn: string | null;
  estimatedHours: number | null;
  spentHours: number | null;
  totalSpentHours: number | null;
  totalEstimatedHours: number | null;
  assignedQA: string | null;
  platform: string | null;
  additionalAssignee: string | null;
  additionalAssignees: AssigneeRef[];
  estimatedTimeForQA: string | null;
  customFields: CustomFieldValue[];
}

export interface StatusMeta {
  id: number;
  name: string;
  isClosed: boolean;
}

export interface TrackerMeta {
  id: number;
  name: string;
}

export interface PriorityMeta {
  id: number;
  name: string;
}

export interface ProjectMeta {
  id: number;
  name: string;
  identifier: string;
  parent: string | null;
}

export interface ProjectIssuesResult {
  issues: Issue[];
  totalCount: number;
  fetchedCount: number;
  durationMs: number;
  fetchedAt: string;
}

export interface MetaResult {
  statuses: StatusMeta[];
  trackers: TrackerMeta[];
  priorities: PriorityMeta[];
  redmineBaseUrl: string;
}

/** Who actually logged time, not who an issue is assigned to. */
export interface TimeEntry {
  id: number;
  project: string;
  issueId: number | null;
  user: string;
  activity: string;
  hours: number;
  comments: string | null;
  spentOn: string;
}

export interface TimeEntriesResult {
  timeEntries: TimeEntry[];
  totalCount: number;
  durationMs: number;
  fetchedAt: string;
}
