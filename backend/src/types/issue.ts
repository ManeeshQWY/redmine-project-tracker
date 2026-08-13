// Normalized internal Issue model used throughout the app (frontend + backend).
// Keeps UI/logic decoupled from raw Redmine field names.

export interface CustomFieldValue {
  id: number;
  name: string;
  value: string | string[] | null;
}

/** A single time log entry — who logged it, not who the issue is assigned to. Distinct from Issue.spentHours (an aggregate on the issue), used to answer "how much time did each person actually log". */
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

export interface TimeEntriesResult {
  timeEntries: TimeEntry[];
  totalCount: number;
  durationMs: number;
  fetchedAt: string;
}
