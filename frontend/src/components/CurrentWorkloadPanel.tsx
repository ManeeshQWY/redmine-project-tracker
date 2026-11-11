import { Fragment, useState } from "react";
import { LoadWindow, windowPhrase } from "../utils/dataWindow";
import { formatHours } from "../utils/format";
import { workloadSheets } from "../utils/reportSheets";
import { summarizeWorkload, WorkloadRow } from "../utils/workload";
import ExportButton from "./ExportButton";

interface Props {
  rows: WorkloadRow[];
  redmineBaseUrl: string;
  loadWindow: LoadWindow;
  projectLabel?: string;
  onLoadAllTime?: () => void;
}

const MAX_TICKETS_SHOWN = 200;
const dim = "text-slate-300 dark:text-slate-600";

function statusText(byStatus: Record<string, number>): string {
  return Object.entries(byStatus)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([status, n]) => `${status} ${n}`)
    .join(" · ");
}

/** Each person's open tickets, of any type — a count per person that expands to the tickets. */
export default function CurrentWorkloadPanel({ rows, redmineBaseUrl, loadWindow, projectLabel = "project", onLoadAllTime }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const limitedWindow = loadWindow.kind === "range" || loadWindow.days > 0;
  const summary = summarizeWorkload(rows);

  function toggle(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const link = (id: number) =>
    redmineBaseUrl ? (
      <a href={`${redmineBaseUrl}/issues/${id}`} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
        #{id}
      </a>
    ) : (
      <span className="font-medium">#{id}</span>
    );

  return (
    <details open className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200">Current tickets per person</summary>
      <div className="mt-2 flex justify-end">
        <ExportButton build={() => workloadSheets(rows, redmineBaseUrl)} filenamePrefix="redmine_current_tickets" projectLabel={projectLabel} label="Export current tickets" disabled={rows.length === 0} />
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Open tickets of every type that the person is on — as Assignee, Additional Assignee or Assigned QA. Closed tickets are not counted.
        The filters above narrow it.
      </p>

      {limitedWindow && (
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <span>
            Only tickets updated in {windowPhrase(loadWindow)} are loaded, so an open ticket nobody has touched since then isn&apos;t
            counted and these numbers can be understated.
          </span>
          {onLoadAllTime && (
            <button
              onClick={onLoadAllTime}
              className="rounded border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-transparent dark:text-amber-300"
            >
              Load all time
            </button>
          )}
        </div>
      )}

      <div className="mt-3 max-h-80 overflow-auto">
        <table className="w-full text-left text-xs" aria-label="Current tickets per person">
          <thead className="sticky top-0 z-[1] bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-2 py-1.5">Name</th>
              <th className="px-2 py-1.5">Role</th>
              <th className="px-2 py-1.5 text-right">Open tickets</th>
              <th className="px-2 py-1.5 text-right">Bugs</th>
              <th className="px-2 py-1.5 text-right" title="Estimate minus hours logged, over their open tickets that have nothing nested under them. A + means some tickets have no estimate, so the real figure is higher.">Hours left</th>
              <th className="px-2 py-1.5 text-right" title="Open tickets with no estimate">No estimate</th>
              <th className="px-2 py-1.5 text-right" title="Open tickets not updated for more than a week">Quiet 7d+</th>
              <th className="px-2 py-1.5 text-right" title="Days since their oldest open ticket was created">Oldest (d)</th>
              <th className="px-2 py-1.5">By status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const open = expanded.has(r.name);
              const expandable = r.tickets.length > 0;
              return (
                <Fragment key={r.name}>
                  <tr
                    className={`border-t border-slate-100 dark:border-slate-800 ${expandable ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" : ""}`}
                    onClick={expandable ? () => toggle(r.name) : undefined}
                    aria-expanded={expandable ? open : undefined}
                  >
                    <td className="px-2 py-1.5">
                      <span className="mr-1.5 inline-block w-3 text-slate-400">{expandable ? (open ? "▾" : "▸") : ""}</span>
                      {r.name}
                    </td>
                    <td className="px-2 py-1.5">{r.role}</td>
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums">{r.open === 0 ? <span className={dim}>0</span> : r.open}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.bugs === 0 ? <span className={dim}>0</span> : r.bugs}</td>
                    <td
                      className="px-2 py-1.5 text-right tabular-nums"
                      title={r.unestimated > 0 ? `${r.unestimated} open ticket${r.unestimated === 1 ? " has" : "s have"} no estimate, so this is a lower bound` : undefined}
                    >
                      {r.open === 0 ? <span className={dim}>0</span> : `${formatHours(r.remainingHours) || "0"}${r.unestimated > 0 ? "+" : ""}`}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.unestimated === 0 ? <span className={dim}>0</span> : r.unestimated}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${r.quiet > 0 ? "font-medium text-rose-600 dark:text-rose-400" : ""}`}>
                      {r.quiet === 0 ? <span className={dim}>0</span> : r.quiet}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.oldestDays === null ? <span className={dim}>—</span> : r.oldestDays}</td>
                    <td className="px-2 py-1.5 text-[11px] text-slate-500 dark:text-slate-400">{statusText(r.byStatus) || <span className={dim}>—</span>}</td>
                  </tr>
                  {open && (
                    <tr className="bg-slate-50/60 dark:bg-slate-800/30">
                      <td colSpan={9} className="px-6 py-2">
                        <ul className="space-y-0.5 text-[11px]">
                          {r.tickets.slice(0, MAX_TICKETS_SHOWN).map((t) => (
                            <li key={t.id} className="flex gap-3">
                              <span className="min-w-0 flex-1 truncate">
                                {link(t.id)} {t.subject}
                              </span>
                              <span className="text-slate-400 dark:text-slate-500">{t.tracker}</span>
                              <span className="w-28 text-right text-slate-500 dark:text-slate-400">{t.status}</span>
                            </li>
                          ))}
                          {r.tickets.length > MAX_TICKETS_SHOWN && (
                            <li className="text-slate-400 dark:text-slate-500">Showing the first {MAX_TICKETS_SHOWN} of {r.tickets.length} tickets.</li>
                          )}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-2 py-6 text-center text-slate-400 dark:text-slate-500">
                  No one matches the current filters.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="sticky bottom-0 bg-slate-50 font-semibold dark:bg-slate-800">
              <tr className="border-t border-slate-300 dark:border-slate-600">
                <td className="px-2 py-1.5">Total ({summary.people.toLocaleString()} people)</td>
                <td className="px-2 py-1.5" />
                <td className="px-2 py-1.5 text-right tabular-nums" title="Each ticket counted once, even when several people are on it">{summary.tickets.toLocaleString()}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{summary.bugs.toLocaleString()}</td>
                <td className="px-2 py-1.5" colSpan={5} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </details>
  );
}
