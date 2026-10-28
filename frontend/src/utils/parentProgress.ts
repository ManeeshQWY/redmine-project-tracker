import { Issue } from "../types/issue";

// Progress of a parent ticket (Epic, Feature, …) through the tickets nested under it:
// how many there are, what status they are in, and how much is finished.

/** Count every ticket nested under a parent (children, grandchildren, …) or only its
 * direct children. */
export type ChildScope = "all" | "direct";

export interface ParentProgressRow {
  id: number;
  parentId: number | null;
  subject: string;
  tracker: string;
  status: string;
  statusIsClosed: boolean;
  assignee: string | null;
  project: string;
  /** Child tickets counted under this parent (excludes the parent itself). */
  total: number;
  closed: number;
  open: number;
  /** closed / total, as 0–100; null when there are no children. */
  closedPercent: number | null;
  /** Mean of the children's own "% done" (0–100). */
  avgDonePercent: number | null;
  byStatus: Record<string, number>;
  childIds: number[];
  /** Redmine's own totals for the parent (they include every child, even ones not loaded). */
  estimatedHours: number | null;
  spentHours: number | null;
}

/** Every parent that has at least one loaded child, with its children summarised. */
export function buildParentProgress(issues: Issue[], scope: ChildScope = "all"): ParentProgressRow[] {
  const byId = new Map(issues.map((i) => [i.id, i]));
  const childrenByParent = new Map<number, Issue[]>();
  for (const issue of issues) {
    if (issue.parentId == null || !byId.has(issue.parentId)) continue;
    const siblings = childrenByParent.get(issue.parentId) ?? [];
    siblings.push(issue);
    childrenByParent.set(issue.parentId, siblings);
  }

  const rows: ParentProgressRow[] = [];
  for (const parent of issues) {
    const direct = childrenByParent.get(parent.id);
    if (!direct || direct.length === 0) continue;

    let kids: Issue[] = direct;
    if (scope === "all") {
      kids = [];
      const seen = new Set<number>([parent.id]);
      const stack = [...direct];
      while (stack.length > 0) {
        const kid = stack.pop()!;
        if (seen.has(kid.id)) continue; // guards a corrupt parent cycle
        seen.add(kid.id);
        kids.push(kid);
        stack.push(...(childrenByParent.get(kid.id) ?? []));
      }
    }

    const byStatus: Record<string, number> = {};
    let closed = 0;
    let doneSum = 0;
    for (const kid of kids) {
      const status = kid.status || "(blank)";
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      if (kid.statusIsClosed) closed += 1;
      doneSum += kid.doneRatio ?? 0;
    }

    rows.push({
      id: parent.id,
      parentId: parent.parentId,
      subject: parent.subject,
      tracker: parent.tracker,
      status: parent.status,
      statusIsClosed: parent.statusIsClosed,
      assignee: parent.assignedTo,
      project: parent.project,
      total: kids.length,
      closed,
      open: kids.length - closed,
      closedPercent: kids.length > 0 ? (closed / kids.length) * 100 : null,
      avgDonePercent: kids.length > 0 ? doneSum / kids.length : null,
      byStatus,
      childIds: kids.map((k) => k.id).sort((a, b) => a - b),
      estimatedHours: parent.totalEstimatedHours ?? parent.estimatedHours ?? null,
      spentHours: parent.totalSpentHours ?? parent.spentHours ?? null,
    });
  }
  return rows;
}

/**
 * Estimate and time spent to show beside a child ticket. When every descendant is listed
 * ("all") each ticket shows only its own hours, so the rows add up to the parent's figure;
 * when only direct children are listed, a child that has children of its own shows Redmine's
 * total for it, so its subtree is not left out.
 */
export function childHours(child: Issue, scope: ChildScope): { estimated: number | null; spent: number | null } {
  if (scope === "direct") {
    return {
      estimated: child.totalEstimatedHours ?? child.estimatedHours ?? null,
      spent: child.totalSpentHours ?? child.spentHours ?? null,
    };
  }
  return { estimated: child.estimatedHours ?? null, spent: child.spentHours ?? null };
}

export type ParentSort = "total" | "open" | "lowestComplete" | "highestComplete";

export function sortParentProgress(rows: ParentProgressRow[], sort: ParentSort): ParentProgressRow[] {
  const pct = (r: ParentProgressRow) => r.closedPercent ?? 0;
  const compare: Record<ParentSort, (a: ParentProgressRow, b: ParentProgressRow) => number> = {
    total: (a, b) => b.total - a.total,
    open: (a, b) => b.open - a.open,
    lowestComplete: (a, b) => pct(a) - pct(b),
    highestComplete: (a, b) => pct(b) - pct(a),
  };
  return [...rows].sort((a, b) => compare[sort](a, b) || b.total - a.total || a.id - b.id);
}

export interface ParentFilters {
  trackers: string[]; // [] = every tracker
  search: string; // matches #id or subject
  state: "all" | "open" | "closed"; // the parent's own status
  topLevelOnly: boolean; // parents that are not themselves under another ticket
}

export function filterParentProgress(rows: ParentProgressRow[], f: ParentFilters): ParentProgressRow[] {
  const q = f.search.trim().toLowerCase();
  const idQuery = q.replace(/^#/, "");
  return rows.filter((r) => {
    if (f.trackers.length > 0 && !f.trackers.includes(r.tracker || "(blank)")) return false;
    if (f.state === "open" && r.statusIsClosed) return false;
    if (f.state === "closed" && !r.statusIsClosed) return false;
    if (f.topLevelOnly && r.parentId != null) return false;
    if (q && !(String(r.id) === idQuery || r.subject.toLowerCase().includes(q))) return false;
    return true;
  });
}

export interface ParentSummary {
  parents: number;
  /** Distinct child tickets across the parents shown (a ticket under two shown parents counts once). */
  children: number;
  closed: number;
  closedPercent: number | null;
}

export function summarizeParents(rows: ParentProgressRow[], issues: Issue[]): ParentSummary {
  const closedById = new Map(issues.map((i) => [i.id, i.statusIsClosed]));
  const unique = new Set<number>();
  for (const r of rows) for (const id of r.childIds) unique.add(id);
  let closed = 0;
  for (const id of unique) if (closedById.get(id)) closed += 1;
  return {
    parents: rows.length,
    children: unique.size,
    closed,
    closedPercent: unique.size > 0 ? (closed / unique.size) * 100 : null,
  };
}

// ---------------------------------------------------------------- status colours

/** Categorical slots, in fixed order (validated palette; dark steps chosen for dark surfaces). */
export const STATUS_COLORS = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
} as const;
export const OTHER_STATUS_COLOR = { light: "#8a8a85", dark: "#8c8b83" } as const;
export const MAX_STATUS_SLOTS = STATUS_COLORS.light.length;

export interface StatusSeries {
  key: string; // chart data key: s0…s7 or "other"
  label: string; // status name, or "Other"
  statuses: string[]; // the Redmine statuses this series stands for
  color: { light: string; dark: string };
}

/**
 * One series per status, coloured by the STATUS (its position in Redmine's configured order,
 * among statuses that actually occur) — never by how many tickets it has, so a filter can't
 * repaint the survivors. More than eight statuses fold the remainder into a grey "Other".
 */
export function buildStatusSeries(statusOrder: string[], present: Iterable<string>): StatusSeries[] {
  const seen = new Set(present);
  const ordered = statusOrder.filter((s) => seen.has(s));
  const unknown = [...seen].filter((s) => !statusOrder.includes(s)).sort((a, b) => a.localeCompare(b));
  const all = [...ordered, ...unknown];

  const series: StatusSeries[] = all.slice(0, MAX_STATUS_SLOTS).map((name, i) => ({
    key: `s${i}`,
    label: name,
    statuses: [name],
    color: { light: STATUS_COLORS.light[i], dark: STATUS_COLORS.dark[i] },
  }));
  if (all.length > MAX_STATUS_SLOTS) {
    series.push({ key: "other", label: "Other", statuses: all.slice(MAX_STATUS_SLOTS), color: OTHER_STATUS_COLOR });
  }
  return series;
}

/** The count of each series for a parent, keyed by series key. */
export function seriesCounts(row: ParentProgressRow, series: StatusSeries[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of series) counts[s.key] = s.statuses.reduce((sum, st) => sum + (row.byStatus[st] ?? 0), 0);
  return counts;
}
