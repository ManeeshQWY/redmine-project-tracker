import { useMemo } from "react";
import { Issue } from "../types/issue";
import { formatHours } from "../utils/format";
import { estimateAccuracy } from "../utils/insights";
import { accuracySheets } from "../utils/reportSheets";
import ExportButton from "./ExportButton";
import TicketLink from "./TicketLink";

interface Props {
  issues: Issue[];
  redmineBaseUrl: string;
  devDoneCounts: boolean;
  projectLabel?: string;
}

const pct = (n: number) => `${Math.round(n)}%`;

/** How well each person's estimates match the hours they logged, on finished work. */
export default function EstimateAccuracyPanel({ issues, redmineBaseUrl, devDoneCounts, projectLabel = "project" }: Props) {
  const a = useMemo(() => estimateAccuracy(issues, devDoneCounts), [issues, devDoneCounts]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Estimate accuracy by person</h3>
        <ExportButton build={() => accuracySheets(a, redmineBaseUrl)} filenamePrefix="redmine_estimate_accuracy" projectLabel={projectLabel} label="Export accuracy" disabled={a.rows.length === 0} />
      </div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Delivered tickets that have both an estimate and hours logged (tickets with nothing nested under them). Over 100% means the work took longer than
        estimated; &ldquo;within 20%&rdquo; is the share of tickets that landed close. If hours are logged in bulk at the end, treat the ratio with care.{" "}
        {devDoneCounts ? "Counting" : "Not counting"} &ldquo;Dev Completed&rdquo; as delivered (change on Overview).
      </p>
      {a.rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">
          No delivered ticket has both an estimate and hours logged, so there is nothing to compare yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-xs" aria-label="Estimate accuracy per person">
              <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-2 py-1.5">Person</th>
                  <th className="px-2 py-1.5 text-right">Tickets</th>
                  <th className="px-2 py-1.5 text-right">Estimated (h)</th>
                  <th className="px-2 py-1.5 text-right">Logged (h)</th>
                  <th className="px-2 py-1.5 text-right">Logged / estimated</th>
                  <th className="px-2 py-1.5 text-right">Within 20%</th>
                </tr>
              </thead>
              <tbody>
                {a.rows.map((r) => (
                  <tr key={r.assignee} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-1.5">{r.assignee}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.tickets}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatHours(r.estimated)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatHours(r.actual)}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${r.ratio > 1.2 ? "font-medium text-rose-600 dark:text-rose-400" : ""}`}>{pct(r.ratio * 100)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{pct(r.withinPercent)}</td>
                  </tr>
                ))}
              </tbody>
              {a.total && (
                <tfoot className="bg-slate-50 font-semibold dark:bg-slate-800">
                  <tr className="border-t border-slate-300 dark:border-slate-600">
                    <td className="px-2 py-1.5">Everyone</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{a.total.tickets}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatHours(a.total.estimated)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatHours(a.total.actual)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{pct(a.total.ratio * 100)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{pct(a.total.withinPercent)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">Biggest overruns</div>
            {a.worst.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">Nothing ran over its estimate.</p>
            ) : (
              <table className="w-full text-left text-[11px]" aria-label="Biggest overruns">
                <tbody>
                  {a.worst.map((w) => (
                    <tr key={w.issue.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="w-16 px-2 py-1"><TicketLink id={w.issue.id} redmineBaseUrl={redmineBaseUrl} /></td>
                      <td className="px-2 py-1">{w.issue.subject}</td>
                      <td className="w-28 px-2 py-1 text-slate-500 dark:text-slate-400">{w.issue.assignedTo ?? "—"}</td>
                      <td className="w-28 px-2 py-1 text-right tabular-nums text-rose-600 dark:text-rose-400">
                        {formatHours(w.actual)} of {formatHours(w.estimated)} h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
