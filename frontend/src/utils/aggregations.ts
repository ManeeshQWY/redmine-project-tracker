import { Issue, TimeEntry } from "../types/issue";

export interface CountBucket {
  key: string;
  count: number;
  percent: number;
}

export const countClosed = (issues: Issue[]) => issues.filter((i) => i.statusIsClosed).length;
export const countNotClosed = (issues: Issue[]) => issues.length - countClosed(issues);

function groupByKey(issues: Issue[], keyFn: (i: Issue) => string | null): CountBucket[] {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    const key = keyFn(issue) ?? "(blank)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = issues.length || 1;
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count, percent: (count / total) * 100 }))
    .sort((a, b) => b.count - a.count);
}

export const aggregateByStatus = (issues: Issue[]) => groupByKey(issues, (i) => i.status || null);
export const aggregateByTracker = (issues: Issue[]) => groupByKey(issues, (i) => i.tracker || null);
export const aggregateByPriority = (issues: Issue[]) => groupByKey(issues, (i) => i.priority || null);
export const aggregateByTargetVersion = (issues: Issue[]) =>
  groupByKey(issues, (i) => i.targetVersion || "No Target Version");

export type AgingBucketLabel = "0-3 Days" | "4-7 Days" | "8-15 Days" | "16-30 Days" | "31-60 Days" | "60+ Days";

const AGING_BUCKETS: { label: AgingBucketLabel; min: number; max: number }[] = [
  { label: "0-3 Days", min: 0, max: 3 },
  { label: "4-7 Days", min: 4, max: 7 },
  { label: "8-15 Days", min: 8, max: 15 },
  { label: "16-30 Days", min: 16, max: 30 },
  { label: "31-60 Days", min: 31, max: 60 },
  { label: "60+ Days", min: 61, max: Infinity },
];

export function daysBetween(start: string, end: Date): number {
  const diffMs = end.getTime() - new Date(start).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function ticketAgeDays(issue: Issue, now = new Date()): number | null {
  if (issue.statusIsClosed || !issue.createdOn) return null;
  return daysBetween(issue.createdOn, now);
}

export function resolutionTimeDays(issue: Issue): number | null {
  if (!issue.statusIsClosed || !issue.closedOn || !issue.createdOn) return null;
  return daysBetween(issue.createdOn, new Date(issue.closedOn));
}

export function bucketAgingOpenTickets(issues: Issue[], now = new Date()): CountBucket[] {
  const counts = new Map<AgingBucketLabel, number>(AGING_BUCKETS.map((b) => [b.label, 0]));
  let total = 0;
  for (const issue of issues) {
    const age = ticketAgeDays(issue, now);
    if (age === null) continue;
    const bucket = AGING_BUCKETS.find((b) => age >= b.min && age <= b.max);
    if (bucket) {
      counts.set(bucket.label, (counts.get(bucket.label) ?? 0) + 1);
      total++;
    }
  }
  total = total || 1;
  return AGING_BUCKETS.map((b) => ({ key: b.label, count: counts.get(b.label) ?? 0, percent: ((counts.get(b.label) ?? 0) / total) * 100 }));
}

export interface ResolutionTimeStats {
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  sampleSize: number;
}

export function resolutionTimeStats(issues: Issue[]): ResolutionTimeStats {
  const times = issues.map(resolutionTimeDays).filter((t): t is number => t !== null);
  if (times.length === 0) return { average: null, median: null, min: null, max: null, sampleSize: 0 };
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return { average: sum / sorted.length, median, min: sorted[0], max: sorted[sorted.length - 1], sampleSize: sorted.length };
}

export interface EstimateVsActual {
  issueId: number;
  estimatedHours: number | null;
  actualHours: number | null;
  variance: number | null;
  variancePercent: number | null;
}

export function estimateVsActual(issue: Issue): EstimateVsActual {
  const estimated = issue.estimatedHours;
  const actual = issue.totalSpentHours ?? issue.spentHours;
  if (estimated === null || estimated === undefined || actual === null || actual === undefined) {
    return { issueId: issue.id, estimatedHours: estimated ?? null, actualHours: actual ?? null, variance: null, variancePercent: null };
  }
  const variance = actual - estimated;
  const variancePercent = estimated === 0 ? null : (variance / estimated) * 100;
  return { issueId: issue.id, estimatedHours: estimated, actualHours: actual, variance, variancePercent };
}

export interface AssigneeSummaryRow {
  assignee: string;
  total: number;
  open: number;
  closed: number;
  totalTimeSpent: number;
}

export function aggregateByAssignee(issues: Issue[]): AssigneeSummaryRow[] {
  const map = new Map<string, AssigneeSummaryRow>();
  for (const issue of issues) {
    const key = issue.assignedTo ?? "(Unassigned)";
    const row = map.get(key) ?? { assignee: key, total: 0, open: 0, closed: 0, totalTimeSpent: 0 };
    row.total++;
    if (issue.statusIsClosed) row.closed++;
    else row.open++;
    row.totalTimeSpent += issue.totalSpentHours ?? issue.spentHours ?? 0;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export interface ReleaseSummaryRow {
  version: string;
  total: number;
  closed: number;
  notClosed: number;
  bugs: number;
  features: number;
  totalEstimatedHours: number;
  totalActualHours: number;
}

export function aggregateByRelease(issues: Issue[]): ReleaseSummaryRow[] {
  const map = new Map<string, ReleaseSummaryRow>();
  for (const issue of issues) {
    const key = issue.targetVersion ?? "No Target Version";
    const row = map.get(key) ?? {
      version: key,
      total: 0,
      closed: 0,
      notClosed: 0,
      bugs: 0,
      features: 0,
      totalEstimatedHours: 0,
      totalActualHours: 0,
    };
    row.total++;
    if (issue.statusIsClosed) row.closed++;
    else row.notClosed++;
    if (issue.tracker === "Bug") row.bugs++;
    if (issue.tracker === "Feature") row.features++;
    row.totalEstimatedHours += issue.estimatedHours ?? 0;
    row.totalActualHours += issue.totalSpentHours ?? issue.spentHours ?? 0;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export interface QASummaryRow {
  qa: string;
  total: number;
  qaPending: number;
  qaCompleted: number;
}

const QA_COMPLETED_STATUSES = new Set(["qa completed", "closed", "test passed"]);

export function aggregateByQA(issues: Issue[]): QASummaryRow[] {
  const map = new Map<string, QASummaryRow>();
  for (const issue of issues) {
    if (!issue.assignedQA) continue;
    const key = issue.assignedQA;
    const row = map.get(key) ?? { qa: key, total: 0, qaPending: 0, qaCompleted: 0 };
    row.total++;
    if (QA_COMPLETED_STATUSES.has(issue.status.trim().toLowerCase())) row.qaCompleted++;
    else row.qaPending++;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export interface UserTimeSummaryRow {
  user: string;
  totalHours: number;
  entryCount: number;
  byActivity: { activity: string; hours: number }[];
}

/** Aggregates by who actually logged the time entry — includes every logger, not just issue assignees. */
export function aggregateTimeByUser(timeEntries: TimeEntry[]): UserTimeSummaryRow[] {
  const map = new Map<string, { totalHours: number; entryCount: number; activityHours: Map<string, number> }>();
  for (const entry of timeEntries) {
    const key = entry.user || "(blank)";
    const row = map.get(key) ?? { totalHours: 0, entryCount: 0, activityHours: new Map<string, number>() };
    row.totalHours += entry.hours;
    row.entryCount++;
    const activityKey = entry.activity || "(blank)";
    row.activityHours.set(activityKey, (row.activityHours.get(activityKey) ?? 0) + entry.hours);
    map.set(key, row);
  }
  return Array.from(map.entries())
    .map(([user, row]) => ({
      user,
      totalHours: row.totalHours,
      entryCount: row.entryCount,
      byActivity: Array.from(row.activityHours.entries())
        .map(([activity, hours]) => ({ activity, hours }))
        .sort((a, b) => b.hours - a.hours),
    }))
    .sort((a, b) => b.totalHours - a.totalHours);
}
