import { Issue, TimeEntry } from "../types/issue";

// Developer/QA performance report. Everything here is a pure function over the already
// loaded issues + time entries + the master role list — no Redmine call of its own.
//
// A person's role comes ONLY from the master list (backend user_roles.json). The ticket
// fields Assignee / Additional Assignee / Assigned QA are used for one thing: knowing who
// is *attached* to a ticket (to hand out its estimate and to credit the bugs under it).
// They never decide whether someone is a Developer or QA. A person who is not in the
// master list is "Unknown" — still visible, so they can be added to the list.

export type PerformanceRole = "Developer" | "QA" | "Unknown";

/** Normalised-name -> role. Names are compared ignoring case and surrounding spaces. */
export type RoleLookup = Map<string, "Developer" | "QA">;

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Builds the lookup from the master list. A name under both roles (`conflicts`) is
 * ambiguous and gets no role. */
export function buildRoleLookup(developers: string[], qa: string[], conflicts: string[] = []): RoleLookup {
  const lookup: RoleLookup = new Map();
  for (const n of developers) lookup.set(normalizeName(n), "Developer");
  for (const n of qa) lookup.set(normalizeName(n), "QA");
  for (const n of conflicts) lookup.delete(normalizeName(n));
  return lookup;
}

/** Trackers that count as a "task" row. Matched on a normalised name so "Change Request",
 * "change-request" and "Change requests" all hit. */
// "cr" is how this Redmine names its Change request tracker.
const TASK_TRACKERS = new Set(["epic", "feature", "story", "bug", "change request", "cr", "suggestion"]);

function normalizeTracker(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/s$/, "");
}

export function isTaskTracker(tracker: string): boolean {
  return TASK_TRACKERS.has(normalizeTracker(tracker));
}

function isBug(issue: Issue): boolean {
  return normalizeTracker(issue.tracker) === "bug";
}

/** Bugs closed as "Not a bug" were never defects, so they count for no one — neither the
 * developer whose ticket it was raised against nor the QA who raised it. Matched ignoring
 * case, spacing and punctuation. */
const EXCLUDED_BUG_STATUSES = new Set(["notabug"]);

function isCountedBug(issue: Issue): boolean {
  return isBug(issue) && !EXCLUDED_BUG_STATUSES.has(issue.status.toLowerCase().replace(/[^a-z]/g, ""));
}

/** The "Testing Type" custom field marks a bug as CT when any of its values is "CT". */
function isCtBug(issue: Issue): boolean {
  const field = issue.customFields.find((f) => f.name.trim().toLowerCase() === "testing type");
  if (!field || field.value == null) return false;
  const values = Array.isArray(field.value) ? field.value : [field.value];
  return values.some((v) => v.trim().toLowerCase() === "ct");
}

/** "Estimated time for QA" is free text in Redmine — accept "4", "4.5", "4,5", "4h" and
 * "2:30"; anything else is treated as not estimated rather than guessed at. */
export function parseQaEstimateHours(raw: string | null): number | null {
  if (raw == null) return null;
  const match = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*(?::\s*(\d{1,2}))?/);
  if (!match) return null;
  const hours = Number(match[1].replace(",", "."));
  const minutes = match[2] ? Number(match[2]) : 0;
  return hours + minutes / 60;
}

export interface PerformanceRow {
  key: string;
  name: string;
  role: PerformanceRole;
  project: string;
  taskId: number;
  ancestorIds: number[]; // parent, grandparent, ... — used to avoid double counting in totals
  taskSubject: string;
  tracker: string;
  status: string;
  statusIsClosed: boolean;
  targetVersion: string | null;
  complexity: null; // not supported yet — kept so the column set is stable
  estimation: number | null;
  /** The task's own estimate as Redmine shows it (its total, children included) — the same on
   * every row of the task, whoever the row is for. `estimation` is this person's share of it. */
  taskEstimate: number | null;
  actuals: number;
  aiUsage: null; // not supported yet
  bugsReported: number;
  ctBugs: number;
}

export interface DateRange {
  from: string | null; // YYYY-MM-DD, inclusive
  to: string | null;
}

interface Accumulator {
  name: string;
  estimation: number;
  hasEstimate: boolean;
  hours: number;
  attached: boolean;
  bugIds: Set<number>;
}

function inRange(date: string | null | undefined, range: DateRange): boolean {
  if (!range.from && !range.to) return true;
  if (!date) return false;
  const day = date.slice(0, 10);
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

/** Everyone attached to a ticket through Assignee, Additional Assignee or Assigned QA —
 * deliberately without saying in what capacity. */
function attachedNames(issue: Issue): string[] {
  const names = new Set<string>();
  if (issue.assignedTo) names.add(issue.assignedTo);
  for (const a of issue.additionalAssignees ?? []) names.add(a.name);
  for (const a of issue.assignedQAs ?? []) names.add(a.name);
  return [...names];
}

/** The people a ticket is assigned to do the work: Assignee and Additional Assignees. */
function workersOf(issue: Issue): string[] {
  const names = new Set<string>();
  if (issue.assignedTo) names.add(issue.assignedTo);
  for (const a of issue.additionalAssignees ?? []) names.add(a.name);
  return [...names];
}

/**
 * One row per (task, person). A parent task consolidates its whole subtree — hours,
 * estimates and bugs of every descendant ticket roll up into the parent's rows, matching
 * how the Time Spent screen treats a ticket id. Role is looked up in `roles`.
 *
 * - Estimation: among the people attached to a ticket, those the master list says are
 *   Developers share the ticket's estimated hours equally (so totals reconcile) and those
 *   it says are QA share "Estimated time for QA". If no listed Developer is on the ticket,
 *   its Assignee / Additional Assignees not yet in the list share the estimate instead.
 * - Actuals: that person's logged hours across the subtree, whether or not attached.
 * - Bugs reported: Developer (and anyone not in the list) — Bug tickets assigned to them,
 *   plus Bug tickets that sit under a ticket they are attached to; QA — Bug tickets they
 *   filed (author) under a ticket they are working on. Bugs with status "Not a bug" never
 *   count. CT Bugs is the subset marked
 *   Testing Type = CT.
 *
 * `range` limits time entries by spent-on date and bugs by created-on date; when active,
 * rows with nothing in the window are dropped.
 */
export function buildPerformanceRows(
  issues: Issue[],
  timeEntries: TimeEntry[],
  range: DateRange,
  roles: RoleLookup
): PerformanceRow[] {
  const roleOf = (name: string): PerformanceRole => roles.get(normalizeName(name)) ?? "Unknown";

  const childrenByParent = new Map<number, Issue[]>();
  for (const issue of issues) {
    if (issue.parentId == null) continue;
    const siblings = childrenByParent.get(issue.parentId) ?? [];
    siblings.push(issue);
    childrenByParent.set(issue.parentId, siblings);
  }

  const hoursByIssue = new Map<number, Map<string, number>>();
  for (const entry of timeEntries) {
    if (entry.issueId === null || !inRange(entry.spentOn, range)) continue;
    const perUser = hoursByIssue.get(entry.issueId) ?? new Map<string, number>();
    perUser.set(entry.user, (perUser.get(entry.user) ?? 0) + entry.hours);
    hoursByIssue.set(entry.issueId, perUser);
  }

  const ctBugIds = new Set(issues.filter((i) => isCountedBug(i) && isCtBug(i)).map((i) => i.id));

  // Who has logged time on each ticket, over ALL dates: a QA "working on" a ticket is
  // part of who they are on it, not something the activity window should change.
  const loggersByIssue = new Map<number, Set<string>>();
  for (const entry of timeEntries) {
    if (entry.issueId === null) continue;
    const names = loggersByIssue.get(entry.issueId) ?? new Set<string>();
    names.add(entry.user);
    loggersByIssue.set(entry.issueId, names);
  }
  const issueById = new Map(issues.map((i) => [i.id, i]));
  const ancestorsOf = (issue: Issue): number[] => {
    const chain: number[] = [];
    let parentId = issue.parentId;
    while (parentId != null && chain.length < 50 && !chain.includes(parentId)) {
      chain.push(parentId);
      parentId = issueById.get(parentId)?.parentId ?? null;
    }
    return chain;
  };
  const rangeActive = Boolean(range.from || range.to);
  const rows: PerformanceRow[] = [];

  for (const task of issues) {
    if (!isTaskTracker(task.tracker)) continue;

    const acc = new Map<string, Accumulator>();
    const slot = (name: string): Accumulator => {
      let a = acc.get(name);
      if (!a) {
        a = { name, estimation: 0, hasEstimate: false, hours: 0, attached: false, bugIds: new Set() };
        acc.set(name, a);
      }
      return a;
    };

    // Everything in the subtree, task included.
    const subtree: Issue[] = [];
    const stack: Issue[] = [task];
    const seen = new Set<number>([task.id]);
    while (stack.length > 0) {
      const current = stack.pop()!;
      subtree.push(current);
      for (const child of childrenByParent.get(current.id) ?? []) {
        if (!seen.has(child.id)) {
          seen.add(child.id);
          stack.push(child);
        }
      }
    }

    let subtreeEstimate = 0;
    let anySubtreeEstimate = false;
    for (const k of subtree) {
      if (k.estimatedHours != null) {
        subtreeEstimate += k.estimatedHours;
        anySubtreeEstimate = true;
      }
      const attached = attachedNames(k);
      for (const name of attached) slot(name).attached = true;

      // The ticket's own estimate goes to the listed Developers on it. Until the people on
      // a ticket are in the master list there are none, so — rather than show nothing —
      // it goes to its not-yet-listed Assignee / Additional Assignees (Redmine's own
      // estimate belongs to the assignee). Their role stays Unknown; QA is never guessed.
      let estimateHolders = attached.filter((n) => roleOf(n) === "Developer");
      if (estimateHolders.length === 0) {
        estimateHolders = workersOf(k).filter((n) => roleOf(n) === "Unknown");
      }
      if (estimateHolders.length > 0 && k.estimatedHours != null) {
        for (const d of estimateHolders) {
          const a = slot(d);
          a.estimation += k.estimatedHours / estimateHolders.length;
          a.hasEstimate = true;
        }
      }
      const testers = attached.filter((n) => roleOf(n) === "QA");
      const qaEstimate = parseQaEstimateHours(k.estimatedTimeForQA);
      if (testers.length > 0 && qaEstimate !== null) {
        for (const q of testers) {
          const a = slot(q);
          a.estimation += qaEstimate / testers.length;
          a.hasEstimate = true;
        }
      }

      const logged = hoursByIssue.get(k.id);
      if (logged) {
        for (const [name, hours] of logged) slot(name).hours += hours;
      }

      // A bug assigned to someone counts against them wherever it sits — most bugs have no
      // parent at all, so linking by parent alone would miss them. (This also covers the
      // task itself when it is a Bug.) QA are credited for bugs they raise, not bugs
      // they are assigned.
      if (isCountedBug(k) && inRange(k.createdOn, range)) {
        for (const name of workersOf(k)) {
          if (roleOf(name) !== "QA") slot(name).bugIds.add(k.id);
        }
      }
    }

    // Bugs: walk down from the task carrying everyone attached to an ancestor, so a bug
    // is credited to each Developer attached to a ticket above it. Each bug is counted
    // once per row.
    const walked = new Set<number>([task.id]);
    const walk = (node: Issue, attachedAbove: Set<string>, loggedAbove: Set<string>) => {
      for (const child of childrenByParent.get(node.id) ?? []) {
        if (walked.has(child.id)) continue;
        walked.add(child.id);
        if (isCountedBug(child) && inRange(child.createdOn, range)) {
          // Developers — and people not in the master list, so their bugs aren't silently
          // shown as zero — are credited with bugs under a ticket they are attached to.
          for (const name of attachedAbove) {
            if (roleOf(name) !== "QA") slot(name).bugIds.add(child.id);
          }
          // QA — only for a bug they raised against a ticket they are working on (named on
          // it or has logged time on it, or on a ticket above it), not any bug they filed.
          const author = child.author;
          if (author && roleOf(author) === "QA" && (attachedAbove.has(author) || loggedAbove.has(author))) {
            slot(author).bugIds.add(child.id);
          }
        }
        walk(
          child,
          new Set([...attachedAbove, ...attachedNames(child)]),
          new Set([...loggedAbove, ...(loggersByIssue.get(child.id) ?? [])])
        );
      }
    };
    walk(task, new Set(attachedNames(task)), new Set(loggersByIssue.get(task.id) ?? []));

    // Redmine's own total (it counts children that may not be loaded); the loaded subtree's sum
    // when Redmine didn't send one.
    const taskEstimate = task.totalEstimatedHours ?? (anySubtreeEstimate ? Math.round(subtreeEstimate * 100) / 100 : null);

    for (const a of acc.values()) {
      const hasActivity = a.hours > 0 || a.bugIds.size > 0;
      if (rangeActive ? !hasActivity : !(hasActivity || a.attached)) continue;
      rows.push({
        key: `${task.id}|${a.name}`,
        name: a.name,
        role: roleOf(a.name),
        project: task.project,
        taskId: task.id,
        ancestorIds: ancestorsOf(task),
        taskSubject: task.subject,
        tracker: task.tracker,
        status: task.status,
        statusIsClosed: task.statusIsClosed,
        targetVersion: task.targetVersion,
        complexity: null,
        estimation: a.hasEstimate ? Math.round(a.estimation * 100) / 100 : null,
        taskEstimate,
        actuals: Math.round(a.hours * 100) / 100,
        aiUsage: null,
        bugsReported: a.bugIds.size,
        ctBugs: [...a.bugIds].filter((id) => ctBugIds.has(id)).length,
      });
    }
  }

  return rows;
}

export interface BugLinkStats {
  bugs: number;
  ctBugs: number;
  unlinkedBugs: number; // no task above them: credited only to their own assignee
  unlinkedCtBugs: number;
}

/** How many of the project's bugs have no task above them. Those still count for the person
 * they are assigned to, but cannot be tied to a ticket's developer or to the QA who raised
 * them — shown so that gap is visible rather than leaving a count unexplained. */
export function bugLinkStats(issues: Issue[]): BugLinkStats {
  const byId = new Map(issues.map((i) => [i.id, i]));
  const stats: BugLinkStats = { bugs: 0, ctBugs: 0, unlinkedBugs: 0, unlinkedCtBugs: 0 };
  for (const bug of issues) {
    if (!isCountedBug(bug)) continue;
    const ct = isCtBug(bug);
    stats.bugs += 1;
    if (ct) stats.ctBugs += 1;

    let linked = false;
    let parentId = bug.parentId;
    const seen = new Set<number>();
    while (parentId != null && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      if (isTaskTracker(parent.tracker)) {
        linked = true;
        break;
      }
      parentId = parent.parentId;
    }
    if (!linked) {
      stats.unlinkedBugs += 1;
      if (ct) stats.unlinkedCtBugs += 1;
    }
  }
  return stats;
}

export interface PerformanceFilters {
  search: string;
  names: string[];
  roles: PerformanceRole[];
  projects: string[];
  trackers: string[];
  statuses: string[];
  versions: string[]; // "(none)" matches tasks with no target version
  state: "all" | "open" | "closed";
}

export const EMPTY_PERFORMANCE_FILTERS: PerformanceFilters = {
  search: "",
  names: [],
  roles: [],
  projects: [],
  trackers: [],
  statuses: [],
  versions: [],
  state: "all",
};

export const NO_VERSION_LABEL = "(none)";

export function filterPerformanceRows(rows: PerformanceRow[], f: PerformanceFilters): PerformanceRow[] {
  const q = f.search.trim().toLowerCase();
  const idQuery = q.replace(/^#/, "");
  return rows.filter((r) => {
    if (f.names.length && !f.names.includes(r.name)) return false;
    if (f.roles.length && !f.roles.includes(r.role)) return false;
    if (f.projects.length && !f.projects.includes(r.project)) return false;
    if (f.trackers.length && !f.trackers.includes(r.tracker)) return false;
    if (f.statuses.length && !f.statuses.includes(r.status)) return false;
    if (f.versions.length && !f.versions.includes(r.targetVersion ?? NO_VERSION_LABEL)) return false;
    if (f.state === "open" && r.statusIsClosed) return false;
    if (f.state === "closed" && !r.statusIsClosed) return false;
    if (q) {
      const hit =
        r.name.toLowerCase().includes(q) ||
        r.taskSubject.toLowerCase().includes(q) ||
        String(r.taskId) === idQuery;
      if (!hit) return false;
    }
    return true;
  });
}

export type GroupKey = "name" | "role" | "project" | "tracker" | "status" | "targetVersion";

export const GROUP_LABELS: Record<GroupKey, string> = {
  name: "Name",
  role: "Role",
  project: "Project",
  tracker: "Tracker",
  status: "Status",
  targetVersion: "Target Version",
};

export interface PerformanceTotals {
  rows: number;
  estimation: number | null; // null when none of the counted rows has an estimate
  actuals: number;
  bugsReported: number;
  ctBugs: number;
}

/** Sums the figures, counting each hour and bug once. A parent task's row already contains
 * its children's figures for that person, so when a person has both a task and one of its
 * descendants in `rows`, only the topmost is added — otherwise a person's total would grow
 * with how deeply their work is nested. `rows` in the result is the plain row count. */
export function totalsOf(rows: PerformanceRow[]): PerformanceTotals {
  const taskIdsByName = new Map<string, Set<number>>();
  for (const r of rows) {
    const ids = taskIdsByName.get(r.name) ?? new Set<number>();
    ids.add(r.taskId);
    taskIdsByName.set(r.name, ids);
  }
  const topmost = rows.filter((r) => {
    const ids = taskIdsByName.get(r.name)!;
    return !r.ancestorIds.some((a) => ids.has(a));
  });
  let estimation = 0;
  let anyEstimate = false;
  let actuals = 0;
  let bugsReported = 0;
  let ctBugs = 0;
  for (const r of topmost) {
    if (r.estimation !== null) {
      estimation += r.estimation;
      anyEstimate = true;
    }
    actuals += r.actuals;
    bugsReported += r.bugsReported;
    ctBugs += r.ctBugs;
  }
  return { rows: rows.length, estimation: anyEstimate ? estimation : null, actuals, bugsReported, ctBugs };
}

export interface PerformanceGroup {
  id: string;
  label: string;
  totals: PerformanceTotals;
  children: PerformanceGroup[]; // sub-groups (when more group keys remain)
  rows: PerformanceRow[]; // leaf rows (when no group keys remain)
}

function groupValue(row: PerformanceRow, key: GroupKey): string {
  if (key === "targetVersion") return row.targetVersion ?? NO_VERSION_LABEL;
  return row[key] || "(blank)";
}

/** Nests `rows` by each key in turn. Groups are ordered by Actuals, largest first. */
export function groupPerformanceRows(rows: PerformanceRow[], keys: GroupKey[], parentId = ""): PerformanceGroup[] {
  if (keys.length === 0) return [];
  const [key, ...rest] = keys;
  const buckets = new Map<string, PerformanceRow[]>();
  for (const row of rows) {
    const v = groupValue(row, key);
    const list = buckets.get(v) ?? [];
    list.push(row);
    buckets.set(v, list);
  }
  return [...buckets.entries()]
    .map(([label, bucketRows]) => {
      const id = `${parentId}/${key}:${label}`;
      return {
        id,
        label,
        totals: totalsOf(bucketRows),
        children: rest.length > 0 ? groupPerformanceRows(bucketRows, rest, id) : [],
        rows: rest.length > 0 ? [] : bucketRows,
      };
    })
    .sort((a, b) => b.totals.actuals - a.totals.actuals || a.label.localeCompare(b.label));
}

export type SortColumn =
  | "name"
  | "taskEstimate"
  | "role"
  | "project"
  | "task"
  | "estimation"
  | "actuals"
  | "bugsReported"
  | "ctBugs";

export function sortPerformanceRows(rows: PerformanceRow[], column: SortColumn, direction: "asc" | "desc"): PerformanceRow[] {
  const sign = direction === "asc" ? 1 : -1;
  const value = (r: PerformanceRow): string | number => {
    switch (column) {
      case "name": return r.name.toLowerCase();
      case "role": return r.role;
      case "project": return r.project.toLowerCase();
      case "task": return r.taskId;
      case "estimation": return r.estimation ?? -1;
      case "taskEstimate": return r.taskEstimate ?? -1;
      case "actuals": return r.actuals;
      case "bugsReported": return r.bugsReported;
      case "ctBugs": return r.ctBugs;
    }
  };
  return [...rows].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return cmp * sign || a.taskId - b.taskId || a.name.localeCompare(b.name);
  });
}
