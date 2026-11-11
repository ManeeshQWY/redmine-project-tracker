import { Issue } from "../types/issue";

// One shared definition of where a ticket is in its life, so every screen that talks about
// "done", "in QA" or "blocked" means the same thing. Redmine has ~40 statuses and a project's real
// finish line is often not a *closed* status (Shop Kerala's is "Dev Completed"), so a status is
// mapped to a stage by its name; anything unmapped falls back to Redmine's own open/closed flag.

export type Stage = "notStarted" | "active" | "devDone" | "inQa" | "qaPassed" | "blocked" | "done" | "dropped";

export const STAGE_ORDER: Stage[] = ["notStarted", "active", "blocked", "devDone", "inQa", "qaPassed", "done", "dropped"];

export const STAGE_LABELS: Record<Stage, string> = {
  notStarted: "Not started",
  active: "Active",
  blocked: "Blocked / waiting",
  devDone: "Dev done, awaiting QA",
  inQa: "In QA",
  qaPassed: "QA passed",
  done: "Done",
  dropped: "Dropped",
};

export const STAGE_HINTS: Record<Stage, string> = {
  notStarted: "Nobody has started it",
  active: "Being worked on, or sent back for rework",
  blocked: "On hold or waiting for someone else",
  devDone: "Development finished, not yet in testing",
  inQa: "Being tested",
  qaPassed: "Testing passed, not yet closed",
  done: "Closed, or released to production",
  dropped: "Closed without being built (duplicate, out of scope, not a defect…)",
};

const key = (status: string) => status.trim().toLowerCase();

const NAMED: [Stage, string[]][] = [
  [
    "notStarted",
    [
      "New", "Assigned", "Request Logged", "Intake Review", "Pending", "Requirement Gathering", "Feasibility Assessment", "BRD Drafting",
      "BRD Approved", "Design Drafting & Review", "Design Approved", "Estimation & Impact", "Moved to Development", "Scope Enhancement/CR",
    ],
  ],
  ["active", ["In Progress", "Development In Progress", "Re-opened", "Reopened", "Test Failed", "UAT Failed", "In Review", "Escalated"]],
  ["devDone", ["Dev Completed", "Development Completed", "Resolved", "Released to QA", "Completed"]],
  ["inQa", ["QA In Progress", "Testing In Progress", "Released for UAT"]],
  ["qaPassed", ["QA Completed", "Testing Completed", "UAT Passed", "Scheduled for Release"]],
  ["done", ["Released to Production"]],
  [
    "blocked",
    [
      "On Hold", "On Hold / Deferred", "Awaiting Customer Response", "External Dependency", "Pending Approval",
      "Awaiting Business Confirmation", "Under Discussion", "Parked", "Deferred",
    ],
  ],
  ["dropped", ["Duplicate", "Out of Scope", "Out of Scope / Rejected", "Unable to Reproduce", "Not a Defect"]],
];

const STAGE_BY_STATUS = new Map<string, Stage>(NAMED.flatMap(([stage, names]) => names.map((n) => [key(n), stage] as [string, Stage])));

/** Stages from "development finished" onwards — what counts as delivered when Dev Completed is the finish line. */
const DEV_FINISHED: ReadonlySet<Stage> = new Set<Stage>(["devDone", "inQa", "qaPassed", "done"]);

export function stageOfStatus(status: string, isClosed: boolean): Stage {
  const named = STAGE_BY_STATUS.get(key(status));
  if (named === "dropped") return "dropped"; // closed or not, it was never going to be built
  if (isClosed) return "done";
  return named ?? "active"; // an open status nobody mapped: assume it is being worked on
}

export function stageOf(issue: Pick<Issue, "status" | "statusIsClosed">): Stage {
  return stageOfStatus(issue.status, issue.statusIsClosed);
}

/** Is the ticket finished, for the purpose of "% delivered"? `devDoneCounts` moves the line to Dev Completed. */
export function isDelivered(stage: Stage, devDoneCounts: boolean): boolean {
  return stage === "done" || (devDoneCounts && DEV_FINISHED.has(stage));
}

/** Still needs work: not delivered and not dropped. */
export function isOpenWork(stage: Stage): boolean {
  return stage !== "done" && stage !== "dropped";
}

/** Tickets with nothing under them — hours and counts are taken from these so a parent and its
 * children are never both counted. */
export function leafIssues(issues: Issue[]): Issue[] {
  const parents = new Set<number>();
  for (const i of issues) if (i.parentId != null) parents.add(i.parentId);
  return issues.filter((i) => !parents.has(i.id));
}

export interface DeliverySummary {
  /** Leaf tickets that are not dropped — the denominator. */
  tickets: number;
  delivered: number;
  deliveredPercent: number | null;
  byStage: Record<Stage, number>;
  /** Hours view: estimated hours of delivered tickets over estimated hours of all tickets that have an estimate. */
  estimatedHours: number;
  deliveredEstimatedHours: number;
  deliveredHoursPercent: number | null;
  /** Leaf tickets without an estimate — the hours view ignores them. */
  unestimated: number;
}

export function emptyStageCounts(): Record<Stage, number> {
  return { notStarted: 0, active: 0, blocked: 0, devDone: 0, inQa: 0, qaPassed: 0, done: 0, dropped: 0 };
}

export function summarizeDelivery(issues: Issue[], devDoneCounts: boolean): DeliverySummary {
  const byStage = emptyStageCounts();
  let tickets = 0;
  let delivered = 0;
  let estimated = 0;
  let deliveredEstimated = 0;
  let unestimated = 0;
  for (const issue of leafIssues(issues)) {
    const stage = stageOf(issue);
    byStage[stage] += 1;
    if (stage === "dropped") continue;
    tickets += 1;
    const done = isDelivered(stage, devDoneCounts);
    if (done) delivered += 1;
    if (issue.estimatedHours == null) {
      unestimated += 1;
    } else {
      estimated += issue.estimatedHours;
      if (done) deliveredEstimated += issue.estimatedHours;
    }
  }
  return {
    tickets,
    delivered,
    deliveredPercent: tickets > 0 ? (delivered / tickets) * 100 : null,
    byStage,
    estimatedHours: estimated,
    deliveredEstimatedHours: deliveredEstimated,
    deliveredHoursPercent: estimated > 0 ? (deliveredEstimated / estimated) * 100 : null,
    unestimated,
  };
}

// ----------------------------------------------------------- "count Dev Completed as delivered"

const DEV_DONE_KEY = "rtt.devDoneCounts";

export function readDevDoneCounts(): boolean {
  try {
    return localStorage.getItem(DEV_DONE_KEY) !== "0"; // on unless switched off
  } catch {
    return true;
  }
}

export function storeDevDoneCounts(value: boolean): void {
  try {
    localStorage.setItem(DEV_DONE_KEY, value ? "1" : "0");
  } catch {
    // private window or blocked storage: the choice just won't be remembered
  }
}
