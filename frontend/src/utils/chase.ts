import { Issue, TimeEntry } from "../types/issue";
import { daysBetween, lastActivity, lastLoggedByIssue, todayString, workingDaysBetween } from "./activity";
import { isOpenWork, leafIssues, Stage, stageOf } from "./stages";

// The stand-up "chase list": each tile is one question a manager asks every morning, with the
// tickets that answer it. Counts use leaf tickets (nothing nested under them) so a parent and its
// children are never both chased for the same work.

export interface ChaseSettings {
  /** An Active ticket with no activity for more than this many working days is stale. */
  staleWorkingDays: number;
  /** Open ticket whose hours are above this percentage of its estimate is over budget. */
  overBudgetPercent: number;
  /** "What moved" looks back this many days. */
  movedDays: number;
}

export const DEFAULT_CHASE_SETTINGS: ChaseSettings = { staleWorkingDays: 3, overBudgetPercent: 120, movedDays: 1 };

/** The largest "days" or "percent" a setting may take — far beyond anything useful, but small enough
 * that no date arithmetic can overflow. */
export const MAX_SETTING = 3650;

const clamp = (n: number) => (Number.isFinite(n) ? Math.min(MAX_SETTING, Math.max(0, Math.round(n))) : 0);

export interface ChaseItem {
  issue: Issue;
  stage: Stage;
  ageDays: number; // since created
  idleDays: number; // calendar days since last activity
  note: string | null; // e.g. "27 h of 20 h"
}

export type ChaseTileId =
  | "stale"
  | "activeUnassigned"
  | "unassigned"
  | "noEstimate"
  | "loggedButNew"
  | "devDoneNoTime"
  | "overBudget"
  | "overdue"
  | "blocked"
  | "moved";

export interface ChaseTile {
  id: ChaseTileId;
  title: string;
  hint: string;
  items: ChaseItem[];
}

const hours = (n: number) => `${Math.round(n * 100) / 100} h`;

export function buildChaseTiles(issues: Issue[], entries: TimeEntry[] | null, settings: ChaseSettings, now: Date): ChaseTile[] {
  const today = todayString(now);
  settings = { staleWorkingDays: clamp(settings.staleWorkingDays), overBudgetPercent: clamp(settings.overBudgetPercent), movedDays: clamp(settings.movedDays) };
  const logged = entries ? lastLoggedByIssue(entries) : null;
  const leaves = leafIssues(issues);

  const item = (issue: Issue, stage: Stage, note: string | null = null): ChaseItem => ({
    issue,
    stage,
    ageDays: daysBetween(issue.createdOn, today),
    idleDays: daysBetween(lastActivity(issue, logged), today),
    note,
  });

  const tiles: Record<ChaseTileId, ChaseItem[]> = {
    stale: [], activeUnassigned: [], unassigned: [], noEstimate: [], loggedButNew: [], devDoneNoTime: [],
    overBudget: [], overdue: [], blocked: [], moved: [],
  };

  for (const issue of leaves) {
    const stage = stageOf(issue);
    const open = isOpenWork(stage);
    const spent = issue.spentHours ?? 0;
    const estimate = issue.estimatedHours;

    if (stage === "active" && workingDaysBetween(lastActivity(issue, logged), today) > settings.staleWorkingDays) {
      tiles.stale.push(item(issue, stage));
    }
    if (stage === "active" && !issue.assignedTo) tiles.activeUnassigned.push(item(issue, stage));
    if (open && !issue.assignedTo) tiles.unassigned.push(item(issue, stage));
    if (open && estimate == null) tiles.noEstimate.push(item(issue, stage));
    if (stage === "notStarted" && spent > 0) tiles.loggedButNew.push(item(issue, stage, hours(spent)));
    if (stage === "devDone" && spent === 0) tiles.devDoneNoTime.push(item(issue, stage, estimate != null ? `est. ${hours(estimate)}` : null));
    if (open && estimate != null && estimate > 0 && spent > (estimate * settings.overBudgetPercent) / 100) {
      tiles.overBudget.push(item(issue, stage, `${hours(spent)} of ${hours(estimate)}`));
    }
    if (open && issue.dueDate && issue.dueDate < today) tiles.overdue.push(item(issue, stage, `due ${issue.dueDate}`));
    if (stage === "blocked") tiles.blocked.push(item(issue, stage));
  }

  // "What moved" is about any ticket — parents included — that was touched recently.
  const since = todayString(new Date(now.getTime() - settings.movedDays * 86_400_000));
  for (const issue of issues) {
    if (issue.updatedOn.slice(0, 10) >= since) tiles.moved.push(item(issue, stageOf(issue)));
  }

  const byIdle = (a: ChaseItem, b: ChaseItem) => b.idleDays - a.idleDays || a.issue.id - b.issue.id;
  const make = (id: ChaseTileId, title: string, hint: string): ChaseTile => ({ id, title, hint, items: [...tiles[id]].sort(byIdle) });
  return [
    make("stale", "Active but gone quiet", `In progress with no update or hours logged for more than ${settings.staleWorkingDays} working days`),
    make("activeUnassigned", "In progress, nobody assigned", "Being worked on but no assignee"),
    make("unassigned", "Open and unassigned", "Open work nobody owns"),
    make("noEstimate", "Open with no estimate", "Open work with no estimated hours"),
    make("loggedButNew", "Hours logged, still not started", "Time has been logged but the status was never moved on"),
    make("devDoneNoTime", "Dev done with no hours logged", "Marked development-complete but nothing was ever logged against it"),
    make("overBudget", "Over budget and still open", `Hours logged are above ${settings.overBudgetPercent}% of the estimate`),
    make("overdue", "Overdue", "Past its due date and still open — only tickets that have a due date can be overdue"),
    make("blocked", "Blocked or waiting", "On hold, or waiting on someone else"),
    make("moved", "What moved", `Updated in the last ${settings.movedDays} day${settings.movedDays === 1 ? "" : "s"}`),
  ];
}

/** The items grouped by assignee (largest group first), for a list or a message. */
export function groupByAssignee(items: ChaseItem[]): { assignee: string; items: ChaseItem[] }[] {
  const groups = new Map<string, ChaseItem[]>();
  for (const it of items) {
    const name = it.issue.assignedTo ?? "(Unassigned)";
    groups.set(name, [...(groups.get(name) ?? []), it]);
  }
  return [...groups]
    .map(([assignee, list]) => ({ assignee, items: list }))
    .sort((a, b) => b.items.length - a.items.length || a.assignee.localeCompare(b.assignee));
}

/** Plain text for pasting into a chat: the tile's title, then each person's tickets. */
export function chaseTileAsText(tile: ChaseTile): string {
  const lines = [`${tile.title} (${tile.items.length})`];
  for (const g of groupByAssignee(tile.items)) {
    lines.push(`${g.assignee} (${g.items.length})`);
    for (const it of g.items) {
      lines.push(`  #${it.issue.id} ${it.issue.subject} — ${it.issue.status}, idle ${it.idleDays}d${it.note ? `, ${it.note}` : ""}`);
    }
  }
  return lines.join("\n");
}
