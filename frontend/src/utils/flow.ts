import { Issue } from "../types/issue";
import { dateOnly, daysBetween, todayString } from "./activity";
import { leafIssues, stageOf } from "./stages";
import { median, percentile } from "./stats";

// Flow: how fast work arrives, how fast it leaves, and how long it takes — all derived from the
// created / closed dates the app already loads, so no snapshots are needed.

export type FlowGranularity = "week" | "month";

export interface FlowPeriod {
  key: string; // first day of the period, YYYY-MM-DD
  label: string;
  created: number;
  closed: number;
  /** Tickets open at the end of the period: created by then and not yet closed. */
  backlog: number;
  /** Days from created to closed for the tickets closed in the period. */
  cycleMedian: number | null;
  cycleP90: number | null;
  closedCount: number; // closed tickets with a cycle time (same as `closed`)
}

const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Math.floor(Date.parse(`${dateOnly(date)}T00:00:00Z`) / DAY_MS);
const dateOfDay = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** The day a ticket was closed. Redmine fills `closedOn` for closed tickets; when it is missing the
 * last update is the best available stand-in. Open tickets have none. */
export function closedDay(issue: Issue): string | null {
  if (issue.closedOn) return dateOnly(issue.closedOn);
  return issue.statusIsClosed ? dateOnly(issue.updatedOn) : null;
}

/** First day of the Monday-based week, or of the month, that contains `date`. */
export function periodStart(date: string, by: FlowGranularity): string {
  if (by === "month") return `${date.slice(0, 7)}-01`;
  const n = dayNumber(date);
  const sinceMonday = (new Date(n * DAY_MS).getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  return dateOfDay(n - sinceMonday);
}

function nextPeriodStart(start: string, by: FlowGranularity): string {
  if (by === "week") return dateOfDay(dayNumber(start) + 7);
  const [y, m] = start.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/**
 * One entry per week or month, oldest first, from the first ticket (or `maxPeriods` back) up to the
 * period containing `now`.
 */
export function buildFlow(issues: Issue[], now: Date, by: FlowGranularity, maxPeriods = 26): FlowPeriod[] {
  if (issues.length === 0) return [];
  const today = todayString(now);
  const firstCreated = issues.reduce((min, i) => (dateOnly(i.createdOn) < min ? dateOnly(i.createdOn) : min), today);

  const starts: string[] = [];
  for (let s = periodStart(firstCreated, by); s <= today; s = nextPeriodStart(s, by)) starts.push(s);
  const shown = starts.slice(-maxPeriods);

  return shown.map((start, idx) => {
    const next = nextPeriodStart(start, by);
    const end = dateOfDay(dayNumber(next) - 1); // last day of the period
    const cycles: number[] = [];
    let created = 0;
    let closed = 0;
    let backlog = 0;
    for (const issue of issues) {
      const made = dateOnly(issue.createdOn);
      const done = closedDay(issue);
      if (made >= start && made <= end) created += 1;
      if (done !== null && done >= start && done <= end) {
        closed += 1;
        cycles.push(daysBetween(made, done));
      }
      if (made <= end && (done === null || done > end)) backlog += 1;
    }
    cycles.sort((a, b) => a - b);
    const label = by === "month" ? start.slice(0, 7) : `w/c ${start.slice(5)}`;
    return {
      key: start,
      label: idx === shown.length - 1 ? `${label} (so far)` : label,
      created,
      closed,
      backlog,
      cycleMedian: median(cycles),
      cycleP90: percentile(cycles, 90),
      closedCount: cycles.length,
    };
  });
}

export interface WipRow {
  assignee: string;
  active: number;
  overLimit: boolean;
}

/** Tickets being worked on right now per person (leaf tickets in the Active stage). */
/** `only` limits whose tickets are counted (e.g. the ones the Tracker chips leave in) while "has children"
 * is still judged on every ticket. */
export function wipByAssignee(issues: Issue[], limit: number, only?: Set<number>): WipRow[] {
  const counts = new Map<string, number>();
  for (const issue of leafIssues(issues)) {
    if (stageOf(issue) !== "active" || (only && !only.has(issue.id))) continue;
    const name = issue.assignedTo ?? "(Unassigned)";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([assignee, active]) => ({ assignee, active, overLimit: active > limit }))
    .sort((a, b) => b.active - a.active || a.assignee.localeCompare(b.assignee));
}
