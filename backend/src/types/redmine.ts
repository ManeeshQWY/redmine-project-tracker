// Raw shapes as returned by the Redmine REST API (support.qwysoft.com).
// These were captured by live inspection of https://support.qwysoft.com — see README "API investigation".

export interface RedmineNamedRef {
  id: number;
  name: string;
}

export interface RedmineProject {
  id: number;
  name: string;
  identifier: string;
  description?: string;
  status: number;
  is_public?: boolean;
  parent?: RedmineNamedRef;
  created_on?: string;
  updated_on?: string;
}

export interface RedmineStatus {
  id: number;
  name: string;
  is_closed: boolean;
  description?: string | null;
}

export interface RedmineTracker {
  id: number;
  name: string;
  default_status?: RedmineNamedRef;
  description?: string | null;
  enabled_standard_fields?: string[];
}

export interface RedminePriority {
  id: number;
  name: string;
  is_default?: boolean;
  active?: boolean;
}

export interface RedmineCustomField {
  id: number;
  name: string;
  // Redmine returns either a scalar (string) or an array (when multiple: true)
  value: string | string[] | null;
  multiple?: boolean;
}

export interface RedmineIssueStatus extends RedmineNamedRef {
  is_closed?: boolean;
}

export interface RedmineIssue {
  id: number;
  project: RedmineNamedRef;
  tracker: RedmineNamedRef;
  status: RedmineIssueStatus;
  priority: RedmineNamedRef;
  author: RedmineNamedRef;
  assigned_to?: RedmineNamedRef;
  parent?: { id: number };
  subject: string;
  description?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  done_ratio?: number;
  is_private?: boolean;
  estimated_hours?: number | null;
  total_estimated_hours?: number | null;
  spent_hours?: number | null;
  total_spent_hours?: number | null;
  fixed_version?: RedmineNamedRef;
  custom_fields?: RedmineCustomField[];
  created_on: string;
  updated_on: string;
  closed_on?: string | null;
}

export interface RedmineIssueListResponse {
  issues: RedmineIssue[];
  total_count: number;
  offset: number;
  limit: number;
}

export interface RedmineMembership {
  id: number;
  project: RedmineNamedRef;
  user?: RedmineNamedRef;
  group?: RedmineNamedRef;
  roles: RedmineNamedRef[];
}

export interface RedmineTimeEntry {
  id: number;
  project: RedmineNamedRef;
  issue?: { id: number };
  user: RedmineNamedRef;
  activity: RedmineNamedRef;
  hours: number;
  comments?: string;
  spent_on: string;
  created_on: string;
  updated_on: string;
}

export interface RedmineCurrentUserResponse {
  user: {
    id: number;
    firstname: string;
    lastname: string;
    login: string;
    mail?: string;
  };
}
