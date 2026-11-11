import { useMemo } from "react";
import { Issue } from "../types/issue";
import { bugHealth } from "../utils/insights";
import { bugHealthSheets } from "../utils/reportSheets";
import ExportButton from "./ExportButton";
import TicketLink from "./TicketLink";

interface Props {
  issues: Issue[];
  redmineBaseUrl: string;
  projectLabel?: string;
  now?: Date;
}

const MAX_SHOWN = 25;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-xl font-semibold text-slate-800 dark:text-slate-100">{value}</div>
    </div>
  );
}

/** Open bugs: how many, who holds them, how old, and how fast bugs usually get closed. */
export default function BugHealthPanel({ issues, redmineBaseUrl, projectLabel = "project", now }: Props) {
  const h = useMemo(() => bugHealth(issues, now ?? new Date()), [issues, now]);
  if (h.totalBugs === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Bug health</h3>
        <ExportButton build={() => bugHealthSheets(h, redmineBaseUrl)} filenamePrefix="redmine_bug_health" projectLabel={projectLabel} label="Export bug health" />
      </div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Bugs marked not-a-defect or duplicate are left out.</p>
      <div className="mb-4 flex flex-wrap gap-8">
        <Stat label="Open bugs" value={h.openBugs.toLocaleString()} />
        <Stat
          label="Median days to close"
          value={h.medianDaysToClose === null ? "—" : `${h.medianDaysToClose} d`}
          hint={`From the ${h.closedBugs} bugs closed in the loaded period`}
        />
        <Stat label="Bugs among all tickets" value={h.bugShare === null ? "—" : `${Math.round(h.bugShare)}%`} hint="Bugs over all tickets that have nothing nested under them" />
      </div>

      {h.openBugs === 0 ? (
        <p className="py-3 text-center text-sm text-slate-400 dark:text-slate-500">No open bugs.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <table className="w-full self-start text-left text-xs" aria-label="Open bugs per person">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1.5">Held by</th>
                <th className="px-2 py-1.5 text-right">Open</th>
                <th className="px-2 py-1.5 text-right">Over 30 days</th>
                <th className="px-2 py-1.5 text-right">Oldest (d)</th>
              </tr>
            </thead>
            <tbody>
              {h.byOwner.map((o) => (
                <tr key={o.assignee} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1.5">{o.assignee}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{o.open}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${o.over30 > 0 ? "font-medium text-rose-600 dark:text-rose-400" : ""}`}>{o.over30}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{o.oldestDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-[11px]" aria-label="Oldest open bugs">
              <tbody>
                {h.oldest.slice(0, MAX_SHOWN).map((b) => (
                  <tr key={b.issue.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="w-16 px-2 py-1"><TicketLink id={b.issue.id} redmineBaseUrl={redmineBaseUrl} /></td>
                    <td className="px-2 py-1">{b.issue.subject}</td>
                    <td className="w-28 px-2 py-1 text-slate-500 dark:text-slate-400">{b.issue.assignedTo ?? "—"}</td>
                    <td className="w-16 px-2 py-1 text-right tabular-nums text-slate-500 dark:text-slate-400">{b.ageDays} d</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {h.oldest.length > MAX_SHOWN && (
              <p className="py-1 text-center text-[11px] text-slate-400 dark:text-slate-500">Oldest {MAX_SHOWN} of {h.oldest.length} shown.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
