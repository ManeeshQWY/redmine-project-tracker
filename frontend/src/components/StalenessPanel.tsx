import { useMemo, useState } from "react";
import { Issue } from "../types/issue";
import { daysBetween, lastActivity, STALE_BUCKETS, stalenessMatrix, StalenessBy, todayString } from "../utils/activity";
import { STAGE_LABELS } from "../utils/stages";
import ExportButton from "./ExportButton";
import TicketLink from "./TicketLink";
import { stalenessSheets } from "../utils/reportSheets";

interface Props {
  issues: Issue[];
  redmineBaseUrl: string;
  projectLabel?: string;
  now?: Date;
}

const MAX_SHOWN = 100;

/** Open tickets by how long since anything happened to them — the view the "Aging" chart (which
 * counts from creation) cannot give. */
export default function StalenessPanel({ issues, redmineBaseUrl, projectLabel = "project", now }: Props) {
  const [by, setBy] = useState<StalenessBy>("stage");
  const [cell, setCell] = useState<{ row: string; bucket: number } | null>(null);
  const today = todayString(now ?? new Date());
  const rows = useMemo(() => stalenessMatrix(issues, now ?? new Date(), by, STAGE_LABELS), [issues, by, now]);

  const selectedRow = cell ? rows.find((r) => r.key === cell.row) : undefined;
  const tickets = cell && selectedRow ? [...selectedRow.buckets[cell.bucket]].sort((a, b) => a.updatedOn.localeCompare(b.updatedOn)) : [];
  const totals = STALE_BUCKETS.map((_, b) => rows.reduce((n, r) => n + r.buckets[b].length, 0));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Gone quiet: days since last update</h3>
        <span className="flex items-center gap-2">
            <ExportButton build={() => stalenessSheets(rows, by, redmineBaseUrl, now ?? new Date())} filenamePrefix="redmine_quiet_tickets" projectLabel={projectLabel} label="Export quiet tickets" disabled={rows.length === 0} />
            <select
          aria-label="Group quiet tickets by"
          value={by}
          onChange={(e) => {
            setBy(e.target.value as StalenessBy);
            setCell(null);
          }}
          className="rounded-md border border-ctl bg-white px-2 py-1 text-xs text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="stage">By stage</option>
          <option value="assignee">By assignee</option>
        </select>
          </span>
      </div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Open tickets (with nothing nested under them) by days since they were last updated. Click a number to list those tickets. Hours logged
        do not count as an update here — the Stand-up tab does count them.
      </p>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">No open tickets.</p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-left text-xs" aria-label="Days since last update">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-2 py-1.5">{by === "stage" ? "Stage" : "Assignee"}</th>
                {STALE_BUCKETS.map((b) => (
                  <th scope="col" key={b.label} className="px-2 py-1.5 text-right">{b.label}</th>
                ))}
                <th scope="col" className="px-2 py-1.5 text-right">Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1.5">{r.label}</td>
                  {r.buckets.map((list, b) => {
                    const active = cell?.row === r.key && cell.bucket === b;
                    const old = b >= 3 && list.length > 0;
                    return (
                      <td key={b} className="px-2 py-1 text-right">
                        {list.length === 0 ? (
                          <span className="text-slate-400 dark:text-slate-500">0</span>
                        ) : (
                          <button
                            onClick={() => setCell(active ? null : { row: r.key, bucket: b })}
                            aria-pressed={active}
                            className={`min-w-[2rem] rounded px-1.5 py-0.5 tabular-nums hover:bg-slate-100 dark:hover:bg-slate-800 ${
                              old ? "font-semibold text-rose-600 dark:text-rose-400" : ""
                            } ${active ? "bg-slate-100 dark:bg-slate-800" : ""}`}
                          >
                            {list.length}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{r.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold dark:bg-slate-800">
              <tr className="border-t border-slate-300 dark:border-slate-600">
                <td className="px-2 py-1.5">Total</td>
                {totals.map((n, b) => (
                  <td key={b} className="px-2 py-1.5 text-right tabular-nums">{n}</td>
                ))}
                <td className="px-2 py-1.5 text-right tabular-nums">{totals.reduce((a, b) => a + b, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {cell && selectedRow && tickets.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
            {selectedRow.label} — {STALE_BUCKETS[cell.bucket].label} <span className="font-normal text-slate-500 dark:text-slate-400">({tickets.length})</span>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-xs">
              <tbody>
                {tickets.slice(0, MAX_SHOWN).map((i) => (
                  <tr key={i.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="w-16 px-2 py-1"><TicketLink id={i.id} redmineBaseUrl={redmineBaseUrl} /></td>
                    <td className="px-2 py-1">{i.subject}</td>
                    <td className="w-28 px-2 py-1 text-slate-500 dark:text-slate-400">{i.status}</td>
                    <td className="w-36 px-2 py-1 text-slate-500 dark:text-slate-400">{i.assignedTo ?? "—"}</td>
                    <td className="w-24 px-2 py-1 text-right tabular-nums text-slate-500 dark:text-slate-400">
                      {daysBetween(lastActivity(i, null), today)}d ago
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tickets.length > MAX_SHOWN && (
              <p className="py-2 text-center text-xs text-slate-500 dark:text-slate-400">Showing the first {MAX_SHOWN} of {tickets.length}.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
