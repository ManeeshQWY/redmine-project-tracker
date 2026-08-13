import { Issue } from "../types/issue";

export interface CountBucket {
  key: string;
  count: number;
  percent: number;
}

export function countClosed(issues: Issue[]): number {
  return issues.filter((i) => i.statusIsClosed).length;
}

export function countNotClosed(issues: Issue[]): number {
  return issues.length - countClosed(issues);
}

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
  const startDate = new Date(start);
  const diffMs = end.getTime() - startDate.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/** Ticket Age = today - createdOn, for open (not closed) tickets only. */
export function ticketAgeDays(issue: Issue, now = new Date()): number | null {
  if (issue.statusIsClosed || !issue.createdOn) return null;
  return daysBetween(issue.createdOn, now);
}

/** Resolution Time = closedOn - createdOn, for closed tickets with a closedOn date. */
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
  if (times.length === 0) {
    return { average: null, median: null, min: null, max: null, sampleSize: 0 };
  }
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    average: sum / sorted.length,
    median,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    sampleSize: sorted.length,
  };
}

export interface EstimateVsActual {
  issueId: number;
  estimatedHours: number | null;
  actualHours: number | null;
  variance: number | null;
  variancePercent: number | null;
}

/** Actual hours use totalSpentHours (primary effort metric per spec), falling back to spentHours if totalSpentHours is unavailable. */
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
