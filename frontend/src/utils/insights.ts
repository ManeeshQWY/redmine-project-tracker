import { Issue } from "../types/issue";
import { dateOnly, daysBetween, todayString } from "./activity";
import { closedDay } from "./flow";
import { isDelivered, isOpenWork, leafIssues, stageOf } from "./stages";
import { median } from "./stats";

// Smaller manager's views that share the stage model: bug health, estimate accuracy, the queue
// waiting for QA, and the quick counts on the Overview.

const isBug = (issue: Issue) => issue.tracker.trim().toLowerCase() === "bug";

// ------------------------------------------------------------------------------- bug health

export interface BugOwnerRow {
  assignee: string;
  open: number;
  oldestDays: number;
  /** Open bugs older than 30 days. */
  over30: number;
}

export interface OpenBug {
  issue: Issue;
  ageDays: number;
}

export interface BugHealth {
  openBugs: number;
  /** Every bug that counts (dropped ones left out) over every leaf ticket that counts. */
  bugShare: number | null;
  totalBugs: number;
  medianDaysToClose: number | null;
  closedBugs: number;
  byOwner: BugOwnerRow[];
  oldest: OpenBug[]; // oldest first
}

export function bugHealth(issues: Issue[], now: Date): BugHealth {
  const today = todayString(now);
  const bugs = issues.filter((i) => isBug(i) && stageOf(i) !== "dropped");
  const open = bugs.filter((i) => isOpenWork(stageOf(i)));
  const owners = new Map<string, BugOwnerRow>();
  const oldest: OpenBug[] = [];
  for (const bug of open) {
    const ageDays = daysBetween(bug.createdOn, today);
    oldest.push({ issue: bug, ageDays });
    const name = bug.assignedTo ?? "(Unassigned)";
    const row = owners.get(name) ?? { assignee: name, open: 0, oldestDays: 0, over30: 0 };
    row.open += 1;
    row.oldestDays = Math.max(row.oldestDays, ageDays);
    if (ageDays > 30) row.over30 += 1;
    owners.set(name, row);
  }
  const cycles: number[] = [];
  for (const bug of bugs) {
    const done = closedDay(bug);
    if (done !== null && bug.statusIsClosed) cycles.push(daysBetween(bug.createdOn, done));
  }
  const leaves = leafIssues(issues).filter((i) => stageOf(i) !== "dropped").length;
  return {
    openBugs: open.length,
    bugShare: leaves > 0 ? (bugs.length / leaves) * 100 : null,
    totalBugs: bugs.length,
    medianDaysToClose: median(cycles),
    closedBugs: cycles.length,
    byOwner: [...owners.values()].sort((a, b) => b.open - a.open || b.oldestDays - a.oldestDays || a.assignee.localeCompare(b.assignee)),
    oldest: oldest.sort((a, b) => b.ageDays - a.ageDays || a.issue.id - b.issue.id),
  };
}

// --------------------------------------------------------------------------- estimate accuracy

export interface AccuracyRow {
  assignee: string;
  tickets: number;
  estimated: number;
  actual: number;
  /** Hours logged over hours estimated: above 1 is an overrun. */
  ratio: number;
  /** Share of the tickets that landed within 20% of their estimate. */
  withinPercent: number;
}

export interface Overrun {
  issue: Issue;
  estimated: number;
  actual: number;
}

export interface Accuracy {
  rows: AccuracyRow[];
  total: Omit<AccuracyRow, "assignee"> | null;
  worst: Overrun[]; // largest overruns in hours
}

/**
 * Estimate against hours logged, per assignee, on delivered leaf tickets that have both — the only
 * tickets where the comparison means anything.
 */
export function estimateAccuracy(issues: Issue[], devDoneCounts: boolean): Accuracy {
  const groups = new Map<string, { tickets: number; estimated: number; actual: number; within: number }>();
  const worst: Overrun[] = [];
  let all = { tickets: 0, estimated: 0, actual: 0, within: 0 };
  for (const issue of leafIssues(issues)) {
    const est = issue.estimatedHours;
    const spent = issue.spentHours ?? 0;
    if (!isDelivered(stageOf(issue), devDoneCounts) || est == null || est <= 0 || spent <= 0) continue;
    const name = issue.assignedTo ?? "(Unassigned)";
    const g = groups.get(name) ?? { tickets: 0, estimated: 0, actual: 0, within: 0 };
    const within = Math.abs(spent - est) / est <= 0.2 ? 1 : 0;
    g.tickets += 1;
    g.estimated += est;
    g.actual += spent;
    g.within += within;
    groups.set(name, g);
    all = { tickets: all.tickets + 1, estimated: all.estimated + est, actual: all.actual + spent, within: all.within + within };
    if (spent > est) worst.push({ issue, estimated: est, actual: spent });
  }
  const toRow = (g: { tickets: number; estimated: number; actual: number; within: number }) => ({
    tickets: g.tickets,
    estimated: Math.round(g.estimated * 100) / 100,
    actual: Math.round(g.actual * 100) / 100,
    ratio: g.actual / g.estimated,
    withinPercent: (g.within / g.tickets) * 100,
  });
  return {
    rows: [...groups].map(([assignee, g]) => ({ assignee, ...toRow(g) })).sort((a, b) => b.tickets - a.tickets || a.assignee.localeCompare(b.assignee)),
    total: all.tickets > 0 ? toRow(all) : null,
    worst: worst.sort((a, b) => b.actual - b.estimated - (a.actual - a.estimated) || a.issue.id - b.issue.id).slice(0, 10),
  };
}

// ----------------------------------------------------------------------------- awaiting QA

export interface AwaitingQa {
  issue: Issue;
  /** Days since it was last updated — roughly how long it has been waiting. */
  waitingDays: number;
}

/** Tickets development has finished but nobody has started testing: the QA queue. Oldest wait first. */
export function awaitingQa(issues: Issue[], now: Date): AwaitingQa[] {
  const today = todayString(now);
  return leafIssues(issues)
    .filter((i) => stageOf(i) === "devDone")
    .map((issue) => ({ issue, waitingDays: daysBetween(dateOnly(issue.updatedOn), today) }))
    .sort((a, b) => b.waitingDays - a.waitingDays || a.issue.id - b.issue.id);
}

// --------------------------------------------------------------------------------- quick counts

export interface QuickCounts {
  unassigned: number;
  noEstimate: number;
  overdue: number;
  created7: number;
  closed7: number;
}

/** The questions a glance at the Overview should answer: open leaf tickets nobody owns, with no
 * estimate, past their due date, and what arrived and left this past week. */
export function quickCounts(issues: Issue[], now: Date): QuickCounts {
  const today = todayString(now);
  const open = leafIssues(issues).filter((i) => isOpenWork(stageOf(i)));
  let created7 = 0;
  let closed7 = 0;
  for (const i of issues) {
    if (daysBetween(i.createdOn, today) < 7) created7 += 1;
    const done = closedDay(i);
    if (done !== null && daysBetween(done, today) < 7) closed7 += 1;
  }
  return {
    unassigned: open.filter((i) => !i.assignedTo).length,
    noEstimate: open.filter((i) => i.estimatedHours == null).length,
    overdue: open.filter((i) => i.dueDate && i.dueDate < today).length,
    created7,
    closed7,
  };
}
