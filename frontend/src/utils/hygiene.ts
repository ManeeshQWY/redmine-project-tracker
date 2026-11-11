import { Issue, TimeEntry } from "../types/issue";
import { isOpenWork, leafIssues, stageOf } from "./stages";

// Planning hygiene: how complete the fields every other report depends on are. A report is only
// as trustworthy as its inputs, so this tells a manager which dashboards to believe and who to nag.

/** The target version a ticket has, or the nearest one on an ancestor — most tickets only have
 * their phase Epic tagged. */
export function effectiveVersion(issue: Issue, byId: Map<number, Issue>): string | null {
  const seen = new Set<number>();
  let current: Issue | undefined = issue;
  while (current && !seen.has(current.id)) {
    if (current.targetVersion) return current.targetVersion;
    seen.add(current.id);
    current = current.parentId != null ? byId.get(current.parentId) : undefined;
  }
  return null;
}

export type HygieneCheckId = "assignee" | "estimate" | "dueDate" | "version" | "priority" | "description";

export interface HygieneCheck {
  id: HygieneCheckId;
  label: string;
  have: number;
  total: number;
  percent: number | null;
  missing: Issue[];
}

export interface HygienePerson {
  name: string;
  open: number;
  noEstimate: number;
  noDueDate: number;
  noVersion: number;
}

export interface HygieneProblem {
  id: "timeNoTicket" | "timeNoComment" | "closedNotDone" | "activeNoTime";
  label: string;
  count: number;
  of: number;
  issues: Issue[]; // empty for time-entry problems
}

export interface HygieneReport {
  openLeaves: number;
  checks: HygieneCheck[];
  people: HygienePerson[];
  problems: HygieneProblem[];
}

const isDefaultPriority = (priority: string) => priority.trim().toLowerCase() === "normal";

/** `only` limits which tickets are measured (the Tracker chips); parents are still looked up in every ticket. */
export function buildHygiene(issues: Issue[], entries: TimeEntry[] | null, only?: Set<number>): HygieneReport {
  const byId = new Map(issues.map((i) => [i.id, i]));
  const inScope = (i: Issue) => !only || only.has(i.id);
  const leaves = leafIssues(issues).filter(inScope);
  const open = leaves.filter((i) => isOpenWork(stageOf(i)));

  const defs: { id: HygieneCheckId; label: string; ok: (i: Issue) => boolean }[] = [
    { id: "assignee", label: "Has an assignee", ok: (i) => !!i.assignedTo },
    { id: "estimate", label: "Has an estimate", ok: (i) => i.estimatedHours != null },
    { id: "dueDate", label: "Has a due date", ok: (i) => !!i.dueDate },
    { id: "version", label: "Has a target version (own or from a parent)", ok: (i) => effectiveVersion(i, byId) !== null },
    { id: "priority", label: "Priority was set (not the default Normal)", ok: (i) => !isDefaultPriority(i.priority) },
    { id: "description", label: "Has a description", ok: (i) => !!i.description && i.description.trim() !== "" },
  ];
  const checks: HygieneCheck[] = defs.map((d) => {
    const missing = open.filter((i) => !d.ok(i));
    const have = open.length - missing.length;
    return { id: d.id, label: d.label, have, total: open.length, percent: open.length > 0 ? (have / open.length) * 100 : null, missing };
  });

  const people = new Map<string, HygienePerson>();
  for (const i of open) {
    const name = i.assignedTo ?? "(Unassigned)";
    const p = people.get(name) ?? { name, open: 0, noEstimate: 0, noDueDate: 0, noVersion: 0 };
    p.open += 1;
    if (i.estimatedHours == null) p.noEstimate += 1;
    if (!i.dueDate) p.noDueDate += 1;
    if (effectiveVersion(i, byId) === null) p.noVersion += 1;
    people.set(name, p);
  }

  const closed = issues.filter((i) => inScope(i) && i.statusIsClosed);
  const closedNotDone = closed.filter((i) => stageOf(i) === "done" && i.doneRatio < 100);
  const activeNoTime = leaves.filter((i) => stageOf(i) === "active" && (i.spentHours ?? 0) === 0);
  const problems: HygieneProblem[] = [
    {
      id: "closedNotDone",
      label: "Closed but not at 100% done",
      count: closedNotDone.length,
      of: closed.length,
      issues: closedNotDone,
    },
    { id: "activeNoTime", label: "In progress with no hours logged", count: activeNoTime.length, of: leaves.filter((i) => stageOf(i) === "active").length, issues: activeNoTime },
  ];
  if (entries) {
    problems.push(
      { id: "timeNoTicket", label: "Time entries not linked to a ticket (whole project)", count: entries.filter((e) => e.issueId === null).length, of: entries.length, issues: [] },
      { id: "timeNoComment", label: "Time entries with no comment (whole project)", count: entries.filter((e) => !e.comments || e.comments.trim() === "").length, of: entries.length, issues: [] }
    );
  }

  return {
    openLeaves: open.length,
    checks,
    people: [...people.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name)),
    problems,
  };
}
