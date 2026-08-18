import { Issue } from "../types/issue";

export interface TicketFilters {
  status: string; // "" = All
  // Tracker is the one global filter, applied consistently across every tab (see the
  // tracker bar in App.tsx) rather than being tab-local like the others here — hence
  // multi-select (string[], [] = All) instead of the single-value string used elsewhere.
  trackers: string[];
  priority: string;
  assignee: string;
  targetVersion: string;
  author: string;
  project: string; // relevant when multiple projects are in view (parent+subprojects, or All Projects)
  dateFrom: string; // ISO date, applies to createdOn
  dateTo: string;
  search: string;
}

export const EMPTY_FILTERS: TicketFilters = {
  status: "",
  trackers: [],
  priority: "",
  assignee: "",
  targetVersion: "",
  author: "",
  project: "",
  dateFrom: "",
  dateTo: "",
  search: "",
};

export function applyFilters(issues: Issue[], filters: TicketFilters): Issue[] {
  const search = filters.search.trim().toLowerCase();
  const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
  const dateTo = filters.dateTo ? new Date(filters.dateTo) : null;

  return issues.filter((issue) => {
    if (filters.status && issue.status !== filters.status) return false;
    if (filters.trackers.length > 0 && !filters.trackers.includes(issue.tracker)) return false;
    if (filters.priority && issue.priority !== filters.priority) return false;
    if (filters.assignee && (issue.assignedTo ?? "(Unassigned)") !== filters.assignee) return false;
    if (filters.targetVersion && (issue.targetVersion ?? "No Target Version") !== filters.targetVersion) return false;
    if (filters.author && issue.author !== filters.author) return false;
    if (filters.project && issue.project !== filters.project) return false;

    if (dateFrom || dateTo) {
      const created = new Date(issue.createdOn);
      if (dateFrom && created < dateFrom) return false;
      if (dateTo && created > dateTo) return false;
    }

    if (search) {
      const haystack = [
        String(issue.id),
        issue.subject,
        issue.description ?? "",
        issue.author,
        issue.assignedTo ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

export type SortField =
  | "id"
  | "project"
  | "createdOn"
  | "updatedOn"
  | "dueDate"
  | "closedOn"
  | "priority"
  | "status"
  | "assignedTo"
  | "estimatedHours"
  | "totalSpentHours";

export interface SortState {
  field: SortField;
  direction: "asc" | "desc";
}

export const DEFAULT_SORT: SortState = { field: "createdOn", direction: "desc" };

/** priorityOrder lets priority sort follow Redmine's configured severity order (e.g. Low..Immediate) instead of alphabetical. */
export function sortIssues(issues: Issue[], sort: SortState, priorityOrder: string[] = []): Issue[] {
  const dir = sort.direction === "asc" ? 1 : -1;
  const rank = new Map(priorityOrder.map((name, idx) => [name, idx]));
  const sorted = [...issues];
  sorted.sort((a, b) => {
    if (sort.field === "priority" && rank.size > 0) {
      const ar = rank.get(a.priority) ?? -1;
      const br = rank.get(b.priority) ?? -1;
      return (ar - br) * dir;
    }
    const av = a[sort.field];
    const bv = b[sort.field];
    if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
  return sorted;
}
