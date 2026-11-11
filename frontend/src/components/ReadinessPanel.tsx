import { useMemo, useState } from "react";
import { useTheme } from "../theme";
import { Issue } from "../types/issue";
import { formatDate, formatHours } from "../utils/format";
import { STATUS_COLORS } from "../utils/parentProgress";
import { buildReadiness, ReadinessGroup, ReadinessRag } from "../utils/readiness";
import { readinessSheets } from "../utils/reportSheets";
import ExportButton from "./ExportButton";
import { STAGE_LABELS, STAGE_ORDER } from "../utils/stages";

interface Props {
  issues: Issue[];
  releaseDates: Map<string, string>;
  devDoneCounts: boolean;
  projectLabel?: string;
  now?: Date;
}

const RAG: Record<ReadinessRag, { label: string; cls: string }> = {
  late: { label: "Late", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
  atRisk: { label: "At risk", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
  onTrack: { label: "On track", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  noDate: { label: "No date", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
  done: { label: "Done", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  inProgress: { label: "In progress", cls: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" },
};

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);

function daysText(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "today";
  return days > 0 ? `in ${days} d` : `${-days} d late`;
}

/** Per release (or per milestone): how far along it is and whether its date looks safe. */
export default function ReadinessPanel({ issues, releaseDates, devDoneCounts, projectLabel = "project", now }: Props) {
  const { isDark } = useTheme();
  const palette = isDark ? STATUS_COLORS.dark : STATUS_COLORS.light;
  const [group, setGroup] = useState<ReadinessGroup>("version");
  const rows = useMemo(() => buildReadiness(issues, group, releaseDates, devDoneCounts, now ?? new Date()), [issues, group, releaseDates, devDoneCounts, now]);

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Release readiness</h3>
        <span className="flex items-center gap-2">
            <ExportButton build={() => readinessSheets(rows, group)} filenamePrefix="redmine_readiness" projectLabel={projectLabel} label="Export readiness" disabled={rows.length === 0} />
            <select
          aria-label="Group readiness by"
          value={group}
          onChange={(e) => setGroup(e.target.value as ReadinessGroup)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="version">By release (own or inherited from a parent)</option>
          <option value="milestone">By milestone / top-level epic</option>
        </select>
          </span>
      </div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Counts tickets with nothing nested under them. A ticket with no target version of its own takes its nearest parent&apos;s. <span className="font-medium">Late</span>:
        the date has passed with work open. <span className="font-medium">At risk</span>: within 14 days and under 70% delivered, or within a week with an open bug.{" "}
        <span className="font-medium">Done</span>: nothing left. {devDoneCounts ? "Counting" : "Not counting"} &ldquo;Dev Completed&rdquo; as delivered (change on Overview).
      </p>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">No tickets.</p>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-left text-xs" aria-label="Release readiness">
            <thead className="sticky top-0 z-[1] bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1.5">{group === "version" ? "Release" : "Milestone"}</th>
                <th className="px-2 py-1.5">Status</th>
                {group === "version" && <th className="px-2 py-1.5">Date</th>}
                {group === "version" && <th className="px-2 py-1.5 text-right">When</th>}
                <th className="px-2 py-1.5 text-right">Tickets</th>
                <th className="px-2 py-1.5">By stage</th>
                <th className="px-2 py-1.5 text-right" title="Tickets delivered, as set by the 'count Dev Completed' switch on Overview">Delivered</th>
                <th className="px-2 py-1.5 text-right" title="Estimated hours of delivered tickets over all estimated hours">By hours</th>
                <th className="px-2 py-1.5 text-right" title="Bugs still open">Open bugs</th>
                <th className="px-2 py-1.5 text-right" title="Open tickets nobody owns">Unassigned</th>
                <th className="px-2 py-1.5 text-right" title="Open tickets with no estimate">No estimate</th>
                <th className="px-2 py-1.5 text-right" title="Estimate minus hours logged on open tickets">Hours left</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1.5">{r.label}</td>
                  <td className="px-2 py-1.5">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${RAG[r.rag].cls}`}>{RAG[r.rag].label}</span>
                  </td>
                  {group === "version" && <td className="whitespace-nowrap px-2 py-1.5">{r.releaseDate ? formatDate(r.releaseDate) : "—"}</td>}
                  {group === "version" && (
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{r.openWork === 0 ? "—" : daysText(r.daysToRelease)}</td>
                  )}
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.tickets}</td>
                  <td className="w-40 px-2 py-1.5">
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label="Tickets by stage">
                      {STAGE_ORDER.filter((s) => s !== "dropped" && r.byStage[s] > 0).map((s) => (
                        <div
                          key={s}
                          title={`${STAGE_LABELS[s]}: ${r.byStage[s]}`}
                          style={{ width: `${(r.byStage[s] / r.tickets) * 100}%`, background: palette[STAGE_ORDER.indexOf(s)] }}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{pct(r.deliveredPercent)}</td>
                  <td
                    className="px-2 py-1.5 text-right tabular-nums"
                    title={r.unestimatedPercent > 20 ? `${Math.round(r.unestimatedPercent)}% of these tickets have no estimate, so this figure is unreliable` : undefined}
                  >
                    {pct(r.hoursPercent)}
                    {r.unestimatedPercent > 20 && r.hoursPercent !== null ? <span className="text-amber-600 dark:text-amber-400"> ⚠</span> : null}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.openBugs === 0 ? <span className="text-slate-300 dark:text-slate-600">0</span> : r.openBugs}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.unassigned === 0 ? <span className="text-slate-300 dark:text-slate-600">0</span> : r.unassigned}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.noEstimate === 0 ? <span className="text-slate-300 dark:text-slate-600">0</span> : r.noEstimate}</td>
                  <td
                    className="px-2 py-1.5 text-right tabular-nums"
                    title={r.noEstimate > 0 ? `${r.noEstimate} open ticket${r.noEstimate === 1 ? " has" : "s have"} no estimate, so this is a lower bound` : undefined}
                  >
                    {`${formatHours(r.hoursLeft) || "0"}${r.noEstimate > 0 ? "+" : ""}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
