import { Issue } from "../types/issue";
import { daysBetween, todayString } from "./activity";
import { effectiveVersion } from "./hygiene";
import { emptyStageCounts, isDelivered, isOpenWork, leafIssues, Stage, stageOf } from "./stages";

// Release readiness: "will we make the date?" for each release (or each milestone/epic).

export type ReadinessGroup = "version" | "milestone";
export type ReadinessRag = "late" | "atRisk" | "onTrack" | "done" | "inProgress" | "noDate";

export const NO_VERSION = "No target version";
export const NO_PARENT = "(No parent)";

export interface ReadinessRow {
  key: string;
  label: string;
  releaseDate: string | null; // only for version groups
  /** Days until the release date; negative when it has passed. */
  daysToRelease: number | null;
  /** Leaf tickets in the group, not counting dropped ones. */
  tickets: number;
  byStage: Record<Stage, number>;
  delivered: number;
  deliveredPercent: number | null;
  /** Estimated hours of delivered tickets over estimated hours of all with an estimate. */
  hoursPercent: number | null;
  openBugs: number;
  unassigned: number;
  noEstimate: number;
  /** Share of the group's tickets that have no estimate — when it is high, `hoursPercent` is not to be trusted. */
  unestimatedPercent: number;
  /** Leaf tickets in the group that are not delivered yet (and not dropped). */
  openWork: number;
  /** Hours still to do: estimate minus hours logged on open tickets, never below zero. */
  hoursLeft: number;
  rag: ReadinessRag;
}

/**
 * Where a release or milestone stands: done when nothing is left, otherwise judged on its date —
 * late once it has passed, at risk when close with a lot left, else on track. With no date there is
 * nothing to judge it against (`hasDate` false, e.g. a milestone), so it is just in progress.
 */
export function ragOf(daysToRelease: number | null, deliveredPercent: number | null, openBugs: number, openWork: number, hasDate = true): ReadinessRag {
  if (openWork === 0) return "done";
  if (daysToRelease === null) return hasDate ? "noDate" : "inProgress";
  if (daysToRelease < 0) return "late";
  const done = deliveredPercent ?? 0;
  if ((daysToRelease <= 14 && done < 70) || (daysToRelease <= 7 && openBugs > 0)) return "atRisk";
  return "onTrack";
}

/** The topmost ticket above this one (or the ticket itself when it has no parent loaded). */
function topAncestor(issue: Issue, byId: Map<number, Issue>): Issue {
  const seen = new Set<number>([issue.id]);
  let current = issue;
  while (current.parentId != null) {
    const parent = byId.get(current.parentId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    current = parent;
  }
  return current;
}

export function buildReadiness(
  issues: Issue[],
  group: ReadinessGroup,
  releaseDates: Map<string, string>,
  devDoneCounts: boolean,
  now: Date
): ReadinessRow[] {
  const today = todayString(now);
  const byId = new Map(issues.map((i) => [i.id, i]));

  interface Acc {
    label: string;
    byStage: Record<Stage, number>;
    tickets: number;
    delivered: number;
    estimated: number;
    deliveredEstimated: number;
    openBugs: number;
    unassigned: number;
    noEstimate: number;
    unestimatedAll: number;
    hoursLeft: number;
  }
  const groups = new Map<string, Acc>();

  for (const issue of leafIssues(issues)) {
    const stage = stageOf(issue);
    let key: string;
    let label: string;
    if (group === "version") {
      key = label = effectiveVersion(issue, byId) ?? NO_VERSION;
    } else {
      const top = topAncestor(issue, byId);
      if (top.id === issue.id) {
        key = label = NO_PARENT;
      } else {
        key = String(top.id);
        label = `#${top.id} ${top.subject}`;
      }
    }
    let acc = groups.get(key);
    if (!acc) {
      acc = { label, byStage: emptyStageCounts(), tickets: 0, delivered: 0, estimated: 0, deliveredEstimated: 0, openBugs: 0, unassigned: 0, noEstimate: 0, unestimatedAll: 0, hoursLeft: 0 };
      groups.set(key, acc);
    }
    acc.byStage[stage] += 1;
    if (stage === "dropped") continue;
    acc.tickets += 1;
    const done = isDelivered(stage, devDoneCounts);
    if (done) acc.delivered += 1;
    if (issue.estimatedHours == null) acc.unestimatedAll += 1;
    if (issue.estimatedHours != null) {
      acc.estimated += issue.estimatedHours;
      if (done) acc.deliveredEstimated += issue.estimatedHours;
    }
    if (isOpenWork(stage) && !done) {
      if (issue.tracker.trim().toLowerCase() === "bug") acc.openBugs += 1;
      if (!issue.assignedTo) acc.unassigned += 1;
      if (issue.estimatedHours == null) acc.noEstimate += 1;
      else acc.hoursLeft += Math.max(0, issue.estimatedHours - (issue.spentHours ?? 0));
    }
  }

  const rows: ReadinessRow[] = [...groups].map(([key, a]) => {
    const releaseDate = group === "version" ? releaseDates.get(key) ?? null : null;
    const daysToRelease = releaseDate ? (releaseDate >= today ? daysBetween(today, releaseDate) : -daysBetween(releaseDate, today)) : null;
    const deliveredPercent = a.tickets > 0 ? (a.delivered / a.tickets) * 100 : null;
    return {
      key,
      label: a.label,
      releaseDate,
      daysToRelease,
      tickets: a.tickets,
      byStage: a.byStage,
      delivered: a.delivered,
      deliveredPercent,
      hoursPercent: a.estimated > 0 ? (a.deliveredEstimated / a.estimated) * 100 : null,
      openBugs: a.openBugs,
      unassigned: a.unassigned,
      noEstimate: a.noEstimate,
      unestimatedPercent: a.tickets > 0 ? (a.unestimatedAll / a.tickets) * 100 : 0,
      openWork: a.tickets - a.delivered,
      hoursLeft: Math.round(a.hoursLeft * 100) / 100,
      rag: ragOf(daysToRelease, deliveredPercent, a.openBugs, a.tickets - a.delivered, group === "version"),
    };
  });

  const order: Record<ReadinessRag, number> = { late: 0, atRisk: 1, onTrack: 2, inProgress: 3, noDate: 4, done: 5 };
  return rows
    .filter((r) => r.tickets > 0)
    .sort((a, b) => order[a.rag] - order[b.rag] || (a.daysToRelease ?? Infinity) - (b.daysToRelease ?? Infinity) || b.tickets - a.tickets || a.label.localeCompare(b.label));
}
