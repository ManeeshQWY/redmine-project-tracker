import { Issue, TimeEntry } from "../types/issue";
import { isOpenWork, leafIssues, Stage, stageOf } from "./stages";

// "How long since anything happened?" — the measure behind every staleness view.

const DAY_MS = 86_400_000;

/** The calendar date where the user is (not the UTC date, which is yesterday for part of every morning in India). */
export function todayString(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * YYYY-MM-DD of a date or timestamp. A plain date (a due date, a day time was logged) is already a calendar date and is kept
 * as is; a Redmine timestamp is in UTC, so it is turned into the date where the user is — a ticket created at 01:30 India time
 * is dated today, not yesterday — the same way `todayString` dates "now".
 */
export function dateOnly(iso: string): string {
  if (iso.length <= 10 || !iso.includes("T")) return iso.slice(0, 10);
  const moment = new Date(iso);
  return Number.isNaN(moment.getTime()) ? iso.slice(0, 10) : todayString(moment);
}

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${dateOnly(date)}T00:00:00Z`) / DAY_MS);
}

/** Whole calendar days from `from` to `to` (never negative). */
export function daysBetween(from: string, to: string): number {
  return Math.max(0, dayNumber(to) - dayNumber(from));
}

/** Monday–Friday days after `from` up to and including `to` — Friday to Monday is one. */
export function workingDaysBetween(from: string, to: string): number {
  const start = dayNumber(from);
  const end = dayNumber(to);
  let count = 0;
  for (let d = start + 1; d <= end; d++) {
    const weekday = new Date(d * DAY_MS).getUTCDay(); // 0 Sun … 6 Sat
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

/** The most recent day anyone logged time on each ticket. Logging time does not touch a ticket's
 * "updated" date in Redmine, so a ticket people are logging hours on would otherwise look idle. */
export function lastLoggedByIssue(entries: TimeEntry[]): Map<number, string> {
  const latest = new Map<number, string>();
  for (const e of entries) {
    if (e.issueId === null) continue;
    const day = dateOnly(e.spentOn);
    const seen = latest.get(e.issueId);
    if (seen === undefined || day > seen) latest.set(e.issueId, day);
  }
  return latest;
}

/** Last time anything happened on a ticket: its last update or the last hours logged on it. */
export function lastActivity(issue: Issue, logged: Map<number, string> | null): string {
  const updated = dateOnly(issue.updatedOn);
  const hours = logged?.get(issue.id);
  return hours !== undefined && hours > updated ? hours : updated;
}

// --------------------------------------------------------------------------- staleness matrix

export const STALE_BUCKETS: { label: string; max: number }[] = [
  { label: "0–3 days", max: 3 },
  { label: "4–7 days", max: 7 },
  { label: "8–14 days", max: 14 },
  { label: "15–30 days", max: 30 },
  { label: "30+ days", max: Infinity },
];

export interface StalenessRow {
  key: string; // a stage or an assignee name
  label: string;
  total: number;
  buckets: Issue[][]; // tickets per bucket, oldest bucket last
}

export type StalenessBy = "stage" | "assignee";

/** Open leaf tickets by days since their last activity (or last update when no hours are given),
 * by stage or by assignee. */
export function stalenessMatrix(
  issues: Issue[],
  now: Date,
  by: StalenessBy,
  stageLabels: Record<Stage, string>,
  logged: Map<number, string> | null = null
): StalenessRow[] {
  const today = todayString(now);
  const rows = new Map<string, StalenessRow>();
  for (const issue of leafIssues(issues)) {
    const stage = stageOf(issue);
    if (!isOpenWork(stage)) continue;
    const key = by === "stage" ? stage : issue.assignedTo ?? "(Unassigned)";
    let row = rows.get(key);
    if (!row) {
      row = { key, label: by === "stage" ? stageLabels[stage] : key, total: 0, buckets: STALE_BUCKETS.map(() => []) };
      rows.set(key, row);
    }
    const days = daysBetween(lastActivity(issue, logged), today);
    row.buckets[STALE_BUCKETS.findIndex((b) => days <= b.max)].push(issue);
    row.total += 1;
  }
  const oldTail = (r: StalenessRow) => r.buckets[3].length + r.buckets[4].length;
  return [...rows.values()].sort((a, b) => oldTail(b) - oldTail(a) || b.total - a.total || a.label.localeCompare(b.label));
}
