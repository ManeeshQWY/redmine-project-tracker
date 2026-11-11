import { Issue, TimeEntry } from "../types/issue";
import { daysBetween, todayString } from "./activity";
import { attachedNames, NO_VERSION_LABEL, normalizeName, PerformanceFilters, PerformanceRole, RoleLookup } from "./performance";
import { leafIssues } from "./stages";

// How many tickets each person has open right now, whatever the ticket type — a separate
// view from the per-task performance rows, which only cover Epics, Features, Stories, Bugs,
// Change requests and Suggestions.

export interface WorkloadRow {
  name: string;
  role: PerformanceRole;
  open: number;
  bugs: number;
  byStatus: Record<string, number>;
  tickets: Issue[]; // the open tickets counted, in status then id order
  /** Hours still to do on their open leaf tickets: estimate minus hours logged, never below zero.
   * Tickets with no estimate add nothing here — they are counted in `unestimated` instead. */
  remainingHours: number;
  /** Open leaf tickets with no estimate, so `remainingHours` is a lower bound when this is above zero. */
  unestimated: number;
  /** Open leaf tickets not updated for more than a week. */
  quiet: number;
  /** Days since their oldest open ticket was created. */
  oldestDays: number | null;
}

/** An open leaf ticket with no update for more than this many days counts as quiet. */
export const QUIET_DAYS = 7;

export interface WorkloadSummary {
  people: number;
  /** Distinct tickets — one shared by two people counts once. */
  tickets: number;
  bugs: number;
}

const isBug = (issue: Issue) => issue.tracker.trim().toLowerCase() === "bug";

/**
 * One row per person: the open (not closed-status) tickets they are on, as Assignee,
 * Additional Assignee or Assigned QA — the same fields the rest of this report uses to say
 * who is on a ticket, without deciding in what capacity.
 *
 * `knownPeople` (see `projectPeople`) are listed even with no open tickets, so it is clear who
 * is free. The Performance filters narrow it: Name and Role
 * choose the people; Project, Tracker (including the app-wide `chipTrackers`), Status, Target
 * Version and Search choose which tickets count. The open/closed filter is ignored — this
 * view is open tickets by definition.
 */
export function buildWorkload(
  issues: Issue[],
  roles: RoleLookup,
  filters: PerformanceFilters,
  chipTrackers: string[],
  knownPeople: string[] = [],
  now: Date = new Date()
): WorkloadRow[] {
  const q = filters.search.trim().toLowerCase();
  const idQuery = q.replace(/^#/, "");
  const wantedNames = new Set(filters.names.map(normalizeName));
  const roleOf = (name: string): PerformanceRole => roles.get(normalizeName(name)) ?? "Unknown";

  const ticketCounts = (issue: Issue): boolean => {
    if (issue.statusIsClosed) return false;
    const tracker = issue.tracker || "(blank)";
    if (chipTrackers.length > 0 && !chipTrackers.includes(tracker)) return false;
    if (filters.trackers.length > 0 && !filters.trackers.includes(tracker)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(issue.status || "(blank)")) return false;
    if (filters.projects.length > 0 && !filters.projects.includes(issue.project || "(blank)")) return false;
    if (filters.versions.length > 0 && !filters.versions.includes(issue.targetVersion ?? NO_VERSION_LABEL)) return false;
    return true;
  };
  const personCounts = (name: string): boolean => {
    if (wantedNames.size > 0 && !wantedNames.has(normalizeName(name))) return false;
    if (filters.roles.length > 0 && !filters.roles.includes(roleOf(name))) return false;
    return true;
  };

  const people = new Map<string, { name: string; tickets: Issue[] }>();
  const person = (name: string) => {
    const key = normalizeName(name);
    let p = people.get(key);
    if (!p) {
      p = { name, tickets: [] };
      people.set(key, p);
    }
    return p;
  };

  for (const issue of issues) {
    if (!ticketCounts(issue)) continue;
    const ticketHit = q === "" || issue.subject.toLowerCase().includes(q) || String(issue.id) === idQuery;
    for (const name of attachedNames(issue)) {
      if (!personCounts(name)) continue;
      // a search matches the person's name (all their tickets) or a ticket's number/subject
      if (!ticketHit && !name.toLowerCase().includes(q)) continue;
      person(name).tickets.push(issue);
    }
  }
  for (const name of knownPeople) {
    if (!personCounts(name)) continue;
    if (q !== "" && !name.toLowerCase().includes(q)) continue;
    person(name);
  }

  const today = todayString(now);
  const leafIds = new Set(leafIssues(issues).map((i) => i.id));
  const rows: WorkloadRow[] = [];
  for (const { name, tickets } of people.values()) {
    const sorted = [...tickets].sort((a, b) => a.status.localeCompare(b.status) || a.id - b.id);
    const byStatus: Record<string, number> = {};
    for (const t of sorted) byStatus[t.status || "(blank)"] = (byStatus[t.status || "(blank)"] ?? 0) + 1;

    let remaining = 0;
    let unestimated = 0;
    let quiet = 0;
    let oldest: number | null = null;
    for (const t of sorted) {
      const age = daysBetween(t.createdOn, today);
      if (oldest === null || age > oldest) oldest = age;
      if (!leafIds.has(t.id)) continue; // a parent's hours are the sum of its children's
      if (t.estimatedHours == null) unestimated += 1;
      else remaining += Math.max(0, t.estimatedHours - (t.spentHours ?? 0));
      if (daysBetween(t.updatedOn, today) > QUIET_DAYS) quiet += 1;
    }
    rows.push({
      name,
      role: roleOf(name),
      open: sorted.length,
      bugs: sorted.filter(isBug).length,
      byStatus,
      tickets: sorted,
      remainingHours: Math.round(remaining * 100) / 100,
      unestimated,
      quiet,
      oldestDays: oldest,
    });
  }
  return rows.sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
}

/**
 * The people who belong to the loaded data: anyone on a ticket (open or closed) or who has
 * logged time. Redmine's own member list isn't read, so this is "has taken part", and the
 * master list is deliberately not added — it covers everyone, not just this project.
 */
export function projectPeople(issues: Issue[], timeEntries: TimeEntry[]): string[] {
  const names = new Map<string, string>();
  const add = (name: string) => {
    const key = normalizeName(name);
    if (key && !names.has(key)) names.set(key, name);
  };
  for (const issue of issues) attachedNames(issue).forEach(add);
  for (const entry of timeEntries) add(entry.user);
  return [...names.values()];
}

export function summarizeWorkload(rows: WorkloadRow[]): WorkloadSummary {
  const seen = new Map<number, Issue>();
  for (const r of rows) for (const t of r.tickets) seen.set(t.id, t);
  return { people: rows.length, tickets: seen.size, bugs: [...seen.values()].filter(isBug).length };
}
