import { Issue } from "../types/issue";
import { STALE_BUCKETS, StalenessBy, StalenessRow, daysBetween, lastActivity, todayString } from "./activity";
import { ChaseTile } from "./chase";
import { FlowPeriod, WipRow } from "./flow";
import { HygieneReport } from "./hygiene";
import { Accuracy, AwaitingQa, BugHealth } from "./insights";
import { Cell, ReportSheet } from "./reportExport";
import { ReadinessGroup, ReadinessRow } from "./readiness";
import { STAGE_LABELS, STAGE_ORDER } from "./stages";
import { Timesheet } from "./timesheet";
import { WorkloadRow } from "./workload";

// What each screen exports. Pure functions from the same data the screen shows to sheet
// definitions, so what is in the file is exactly what is on screen — and so they can be tested.

const round = (n: number, digits = 2): number => Math.round(n * 10 ** digits) / 10 ** digits;
const percent = (n: number | null): number | null => (n === null ? null : round(n, 1));

/** A ticket number as a link to the ticket in Redmine (plain text when the address is unknown). */
export function ticketCell(id: number, redmineBaseUrl: string): Cell {
  return redmineBaseUrl ? { text: `#${id}`, hyperlink: `${redmineBaseUrl}/issues/${id}` } : `#${id}`;
}

// ------------------------------------------------------------------------------ stand-up

export function chaseSheets(tiles: ChaseTile[], redmineBaseUrl: string): ReportSheet[] {
  return [
    {
      name: "Summary",
      columns: [
        { header: "Question", key: "question", width: 36 },
        { header: "Tickets", key: "count", width: 10 },
        { header: "What it means", key: "hint", width: 80 },
      ],
      rows: tiles.map((t) => ({ question: t.title, count: t.items.length, hint: t.hint })),
    },
    {
      name: "Tickets",
      columns: [
        { header: "Question", key: "question", width: 34 },
        { header: "Ticket", key: "ticket", width: 10 },
        { header: "Subject", key: "subject", width: 56 },
        { header: "Tracker", key: "tracker", width: 12 },
        { header: "Status", key: "status", width: 18 },
        { header: "Assignee", key: "assignee", width: 22 },
        { header: "Days idle", key: "idle", width: 10 },
        { header: "Age (days)", key: "age", width: 10 },
        { header: "Detail", key: "note", width: 22 },
      ],
      rows: tiles.flatMap((t) =>
        t.items.map((it) => ({
          question: t.title,
          ticket: ticketCell(it.issue.id, redmineBaseUrl),
          subject: it.issue.subject,
          tracker: it.issue.tracker,
          status: it.issue.status,
          assignee: it.issue.assignedTo ?? "",
          idle: it.idleDays,
          age: it.ageDays,
          note: it.note ?? "",
        }))
      ),
    },
  ];
}

// ------------------------------------------------------------------------- data quality

const issueColumns = [
  { header: "Ticket", key: "ticket", width: 10 },
  { header: "Subject", key: "subject", width: 56 },
  { header: "Tracker", key: "tracker", width: 12 },
  { header: "Status", key: "status", width: 18 },
  { header: "Assignee", key: "assignee", width: 22 },
];

export function hygieneSheets(report: HygieneReport, redmineBaseUrl: string): ReportSheet[] {
  const ticketRows = (label: string, issues: Issue[]) =>
    issues.map((i) => ({ check: label, ticket: ticketCell(i.id, redmineBaseUrl), subject: i.subject, tracker: i.tracker, status: i.status, assignee: i.assignedTo ?? "" }));
  return [
    {
      name: "Completeness",
      columns: [
        { header: "Check (open tickets with nothing under them)", key: "check", width: 48 },
        { header: "Tickets that have it", key: "have", width: 18 },
        { header: "Open tickets", key: "total", width: 14 },
        { header: "Percent", key: "percent", width: 10 },
        { header: "Missing", key: "missing", width: 10 },
      ],
      rows: report.checks.map((c) => ({ check: c.label, have: c.have, total: c.total, percent: percent(c.percent), missing: c.missing.length })),
    },
    {
      name: "Things that look wrong",
      columns: [
        { header: "Problem", key: "problem", width: 44 },
        { header: "Count", key: "count", width: 10 },
        { header: "Out of", key: "of", width: 10 },
        { header: "Percent", key: "percent", width: 10 },
      ],
      rows: report.problems.map((p) => ({ problem: p.label, count: p.count, of: p.of, percent: p.of > 0 ? round((p.count / p.of) * 100, 1) : null })),
    },
    {
      name: "Gaps by assignee",
      columns: [
        { header: "Assignee", key: "name", width: 26 },
        { header: "Open tickets", key: "open", width: 14 },
        { header: "No estimate", key: "noEstimate", width: 12 },
        { header: "No due date", key: "noDueDate", width: 12 },
        { header: "No target version", key: "noVersion", width: 18 },
      ],
      rows: report.people.map((p) => ({ name: p.name, open: p.open, noEstimate: p.noEstimate, noDueDate: p.noDueDate, noVersion: p.noVersion })),
    },
    {
      name: "Tickets with gaps",
      columns: [{ header: "Problem", key: "check", width: 44 }, ...issueColumns],
      rows: [
        ...report.checks.flatMap((c) => ticketRows(`Missing: ${c.label}`, c.missing)),
        ...report.problems.flatMap((p) => ticketRows(p.label, p.issues)),
      ],
    },
  ];
}

// ------------------------------------------------------------------------------ readiness

export function readinessSheets(rows: ReadinessRow[], group: ReadinessGroup): ReportSheet[] {
  const stages = STAGE_ORDER.filter((s) => s !== "dropped");
  return [
    {
      name: group === "version" ? "Release readiness" : "Milestone readiness",
      columns: [
        { header: group === "version" ? "Release" : "Milestone", key: "label", width: 44 },
        { header: "Status", key: "rag", width: 12 },
        ...(group === "version"
          ? [
              { header: "Release date", key: "date", width: 14 },
              { header: "Days to release (negative = late)", key: "days", width: 18 },
            ]
          : []),
        { header: "Tickets", key: "tickets", width: 10 },
        ...stages.map((s) => ({ header: STAGE_LABELS[s], key: `stage_${s}`, width: 14 })),
        { header: "Delivered", key: "delivered", width: 10 },
        { header: "Delivered %", key: "deliveredPercent", width: 12 },
        { header: "Delivered % by hours", key: "hoursPercent", width: 14 },
        { header: "Tickets without an estimate %", key: "unestimatedPercent", width: 20 },
        { header: "Open bugs", key: "openBugs", width: 10 },
        { header: "Unassigned", key: "unassigned", width: 12 },
        { header: "No estimate", key: "noEstimate", width: 12 },
        { header: "Hours left (lower bound when tickets have no estimate)", key: "hoursLeft", width: 22 },
      ],
      rows: rows.map((r) => ({
        label: r.label,
        rag: RAG_LABEL[r.rag],
        date: r.releaseDate ?? "",
        days: r.daysToRelease,
        tickets: r.tickets,
        ...Object.fromEntries(stages.map((s) => [`stage_${s}`, r.byStage[s]])),
        delivered: r.delivered,
        deliveredPercent: percent(r.deliveredPercent),
        hoursPercent: percent(r.hoursPercent),
        unestimatedPercent: percent(r.unestimatedPercent),
        openBugs: r.openBugs,
        unassigned: r.unassigned,
        noEstimate: r.noEstimate,
        hoursLeft: r.hoursLeft,
      })),
    },
  ];
}

const RAG_LABEL: Record<ReadinessRow["rag"], string> = {
  late: "Late",
  atRisk: "At risk",
  onTrack: "On track",
  done: "Done",
  inProgress: "In progress",
  noDate: "No date",
};

// ------------------------------------------------------------------------------------ flow

export function flowSheets(periods: FlowPeriod[], wip: WipRow[]): ReportSheet[] {
  return [
    {
      name: "Flow",
      columns: [
        { header: "Period", key: "label", width: 22 },
        { header: "Starts", key: "start", width: 12 },
        { header: "Created", key: "created", width: 10 },
        { header: "Closed", key: "closed", width: 10 },
        { header: "Open at end of period", key: "backlog", width: 20 },
        { header: "Median days to close", key: "median", width: 20 },
        { header: "Slowest 10% start at (days)", key: "p90", width: 24 },
      ],
      rows: periods.map((p) => ({ label: p.label, start: p.key, created: p.created, closed: p.closed, backlog: p.backlog, median: p.cycleMedian, p90: p.cycleP90 })),
    },
    {
      name: "Work in progress",
      columns: [
        { header: "Person", key: "assignee", width: 26 },
        { header: "Tickets in progress", key: "active", width: 18 },
        { header: "Over the limit", key: "over", width: 14 },
      ],
      rows: wip.map((w) => ({ assignee: w.assignee, active: w.active, over: w.overLimit ? "Yes" : "No" })),
    },
  ];
}

// ------------------------------------------------------------------------------- timesheet

export function timesheetSheets(sheet: Timesheet): ReportSheet[] {
  return [
    {
      name: "Timesheet",
      columns: [
        { header: "Person", key: "name", width: 26 },
        ...sheet.days.map((d) => ({ header: d, key: `d_${d}`, width: 11 })),
        { header: "Days logged", key: "daysLogged", width: 12 },
        { header: "Days missing", key: "missing", width: 12 },
        { header: "Hours", key: "total", width: 10 },
        { header: "Capacity %", key: "capacity", width: 12 },
        { header: "Days over the daily limit", key: "over", width: 22 },
        { header: "Open tickets", key: "open", width: 12 },
        { header: "Last logged", key: "last", width: 14 },
      ],
      rows: sheet.people.map((p) => ({
        name: p.name,
        ...Object.fromEntries(sheet.days.map((d) => [`d_${d}`, p.hoursByDay[d] ? round(p.hoursByDay[d]) : 0])),
        daysLogged: p.daysLogged,
        missing: p.missingDays,
        total: round(p.total),
        capacity: round(p.capacityPercent, 1),
        over: p.overDays,
        open: p.openTickets,
        last: p.lastLogged ?? "",
      })),
    },
  ];
}

// ----------------------------------------------------------------------- current tickets

export function workloadSheets(rows: WorkloadRow[], redmineBaseUrl: string): ReportSheet[] {
  return [
    {
      name: "Current tickets",
      columns: [
        { header: "Name", key: "name", width: 26 },
        { header: "Role", key: "role", width: 12 },
        { header: "Open tickets", key: "open", width: 12 },
        { header: "Bugs", key: "bugs", width: 8 },
        { header: "Hours left (a lower bound when No estimate is above 0)", key: "hoursLeft", width: 26 },
        { header: "No estimate", key: "unestimated", width: 12 },
        { header: "Quiet 7 days+", key: "quiet", width: 14 },
        { header: "Oldest open ticket (days)", key: "oldest", width: 22 },
        { header: "By status", key: "byStatus", width: 60 },
      ],
      rows: rows.map((r) => ({
        name: r.name,
        role: r.role,
        open: r.open,
        bugs: r.bugs,
        hoursLeft: r.remainingHours,
        unestimated: r.unestimated,
        quiet: r.quiet,
        oldest: r.oldestDays,
        byStatus: Object.entries(r.byStatus).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(" · "),
      })),
    },
    {
      name: "Tickets",
      columns: [{ header: "Person", key: "name", width: 26 }, ...issueColumns.filter((c) => c.key !== "assignee")],
      rows: rows.flatMap((r) =>
        r.tickets.map((t) => ({ name: r.name, ticket: ticketCell(t.id, redmineBaseUrl), subject: t.subject, tracker: t.tracker, status: t.status }))
      ),
    },
  ];
}

// ------------------------------------------------------------------------------ staleness

export function stalenessSheets(rows: StalenessRow[], by: StalenessBy, redmineBaseUrl: string, now: Date): ReportSheet[] {
  const today = todayString(now);
  return [
    {
      name: "Quiet tickets",
      columns: [
        { header: by === "stage" ? "Stage" : "Assignee", key: "label", width: 28 },
        ...STALE_BUCKETS.map((b, i) => ({ header: b.label, key: `b${i}`, width: 12 })),
        { header: "Open", key: "total", width: 10 },
      ],
      rows: rows.map((r) => ({ label: r.label, ...Object.fromEntries(r.buckets.map((list, i) => [`b${i}`, list.length])), total: r.total })),
    },
    {
      name: "Tickets",
      columns: [
        { header: by === "stage" ? "Group (stage)" : "Group (assignee)", key: "label", width: 28 },
        { header: "Days since update", key: "bucket", width: 18 },
        ...issueColumns,
        { header: "Last updated", key: "updated", width: 14 },
        { header: "Days since update (number)", key: "days", width: 22 },
      ],
      rows: rows.flatMap((r) =>
        r.buckets.flatMap((list, i) =>
          list.map((t) => ({
            label: r.label,
            bucket: STALE_BUCKETS[i].label,
            ticket: ticketCell(t.id, redmineBaseUrl),
            subject: t.subject,
            tracker: t.tracker,
            status: t.status,
            assignee: t.assignedTo ?? "",
            updated: lastActivity(t, null),
            days: daysBetween(lastActivity(t, null), today),
          }))
        )
      ),
    },
  ];
}

// ------------------------------------------------------------------ open tickets per user

export interface UserTicketRow {
  issue: Issue;
  assignmentType: string;
  age: number;
}

export function userTicketsSheets(user: string, tickets: UserTicketRow[], redmineBaseUrl: string): ReportSheet[] {
  return [
    {
      name: "Open tickets",
      columns: [
        { header: "Person", key: "user", width: 24 },
        { header: "Ticket", key: "ticket", width: 10 },
        { header: "Subject", key: "subject", width: 56 },
        { header: "Tracker", key: "tracker", width: 12 },
        { header: "Status", key: "status", width: 18 },
        { header: "Priority", key: "priority", width: 10 },
        { header: "Assigned as", key: "type", width: 16 },
        { header: "Created", key: "created", width: 12 },
        { header: "Age (days)", key: "age", width: 10 },
        { header: "Due date", key: "due", width: 12 },
        { header: "Estimated (h)", key: "estimated", width: 14 },
        { header: "Logged (h)", key: "spent", width: 12 },
        { header: "Target version", key: "version", width: 20 },
      ],
      rows: tickets.map((t) => ({
        user,
        ticket: ticketCell(t.issue.id, redmineBaseUrl),
        subject: t.issue.subject,
        tracker: t.issue.tracker,
        status: t.issue.status,
        priority: t.issue.priority,
        type: t.assignmentType,
        created: t.issue.createdOn.slice(0, 10),
        age: t.age,
        due: t.issue.dueDate ?? "",
        estimated: t.issue.estimatedHours === null ? "" : round(t.issue.estimatedHours),
        spent: t.issue.spentHours === null ? "" : round(t.issue.spentHours),
        version: t.issue.targetVersion ?? "",
      })),
    },
  ];
}

// ------------------------------------------------------------------- bugs and accuracy

export function bugHealthSheets(h: BugHealth, redmineBaseUrl: string): ReportSheet[] {
  return [
    {
      name: "Open bugs per person",
      columns: [
        { header: "Held by", key: "assignee", width: 26 },
        { header: "Open bugs", key: "open", width: 12 },
        { header: "Over 30 days", key: "over30", width: 14 },
        { header: "Oldest (days)", key: "oldest", width: 14 },
      ],
      rows: h.byOwner.map((o) => ({ assignee: o.assignee, open: o.open, over30: o.over30, oldest: o.oldestDays })),
    },
    {
      name: "Open bugs",
      columns: [...issueColumns, { header: "Age (days)", key: "age", width: 12 }],
      rows: h.oldest.map((b) => ({
        ticket: ticketCell(b.issue.id, redmineBaseUrl),
        subject: b.issue.subject,
        tracker: b.issue.tracker,
        status: b.issue.status,
        assignee: b.issue.assignedTo ?? "",
        age: b.ageDays,
      })),
    },
  ];
}

export function accuracySheets(a: Accuracy, redmineBaseUrl: string): ReportSheet[] {
  const rows = [...a.rows, ...(a.total ? [{ assignee: "Everyone", ...a.total }] : [])];
  return [
    {
      name: "Estimate accuracy",
      columns: [
        { header: "Person", key: "assignee", width: 26 },
        { header: "Tickets", key: "tickets", width: 10 },
        { header: "Estimated (h)", key: "estimated", width: 14 },
        { header: "Logged (h)", key: "actual", width: 12 },
        { header: "Logged / estimated %", key: "ratio", width: 20 },
        { header: "Within 20% of estimate %", key: "within", width: 22 },
      ],
      rows: rows.map((r) => ({ assignee: r.assignee, tickets: r.tickets, estimated: r.estimated, actual: r.actual, ratio: round(r.ratio * 100, 1), within: round(r.withinPercent, 1) })),
    },
    {
      name: "Biggest overruns",
      columns: [...issueColumns, { header: "Estimated (h)", key: "estimated", width: 14 }, { header: "Logged (h)", key: "actual", width: 12 }],
      rows: a.worst.map((w) => ({
        ticket: ticketCell(w.issue.id, redmineBaseUrl),
        subject: w.issue.subject,
        tracker: w.issue.tracker,
        status: w.issue.status,
        assignee: w.issue.assignedTo ?? "",
        estimated: round(w.estimated),
        actual: round(w.actual),
      })),
    },
  ];
}

export function awaitingQaSheets(list: AwaitingQa[], redmineBaseUrl: string): ReportSheet[] {
  return [
    {
      name: "Waiting for QA",
      columns: [...issueColumns, { header: "Days waiting (since last update)", key: "days", width: 28 }],
      rows: list.map((q) => ({
        ticket: ticketCell(q.issue.id, redmineBaseUrl),
        subject: q.issue.subject,
        tracker: q.issue.tracker,
        status: q.issue.status,
        assignee: q.issue.assignedTo ?? "",
        days: q.waitingDays,
      })),
    },
  ];
}
