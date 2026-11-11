import { useMemo } from "react";
import { useTheme } from "../theme";
import { Issue } from "../types/issue";
import { stageColor } from "../utils/stageColors";
import { STAGE_HINTS, STAGE_LABELS, STAGE_ORDER, summarizeDelivery } from "../utils/stages";

interface Props {
  issues: Issue[];
  devDoneCounts: boolean;
  onDevDoneCountsChange: (value: boolean) => void;
}

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);

/** How much of the work is actually finished, by stage — the answer the Closed/Not-closed tiles
 * cannot give when a team's finish line is "Dev Completed" rather than a closed status. */
export default function DeliveryPanel({ issues, devDoneCounts, onDevDoneCountsChange }: Props) {
  const { isDark } = useTheme();
  const summary = useMemo(() => summarizeDelivery(issues, devDoneCounts), [issues, devDoneCounts]);
  const shown = STAGE_ORDER.filter((s) => s !== "dropped" && summary.byStage[s] > 0);
  const unestimatedShare = summary.tickets > 0 ? summary.unestimated / summary.tickets : 0;
  const barLabel =
    `${summary.delivered} of ${summary.tickets} tickets delivered` +
    (shown.length > 0 ? `; ${shown.map((s) => `${summary.byStage[s]} ${STAGE_LABELS[s].toLowerCase()}`).join(", ")}` : "");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:p-5">
      <h3 className="mb-4 text-[15px] font-semibold leading-5 text-slate-900 dark:text-slate-50">Delivery progress</h3>

      <div className="mb-4 flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Delivered (tickets)</div>
          <div className="text-5xl font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-50">{pct(summary.deliveredPercent)}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {summary.delivered.toLocaleString()} of {summary.tickets.toLocaleString()} tickets
          </div>
        </div>
        <div>
          <div
            className="text-xs font-medium text-slate-600 dark:text-slate-400"
            title="Only tickets with nothing nested under them and an estimate count — a parent's own estimate is not added on top of its children's"
          >
            Delivered (estimated hours)
          </div>
          <div className="text-[28px] font-semibold leading-8 tracking-tight text-slate-900 dark:text-slate-50">{pct(summary.deliveredHoursPercent)}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {Math.round(summary.deliveredEstimatedHours).toLocaleString()} of {Math.round(summary.estimatedHours).toLocaleString()} h
            {summary.unestimated > 0 ? ` · ${summary.unestimated.toLocaleString()} with no estimate` : ""}
          </div>
        </div>
      </div>

      {unestimatedShare > 0.2 && (
        <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {Math.round(unestimatedShare * 100)}% of tickets have no estimate, so the hours figure is unreliable.
        </p>
      )}

      {summary.tickets === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Nothing to deliver in this selection.</p>
      ) : (
        <>
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label={barLabel}>
            {shown.map((s) => (
              <div
                key={s}
                title={`${STAGE_LABELS[s]}: ${summary.byStage[s]}`}
                className="min-w-[3px] first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(summary.byStage[s] / summary.tickets) * 100}%`, background: stageColor(s, isDark) }}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300" aria-label="Stage legend">
            {shown.map((s) => (
              <li key={s} className="flex items-center gap-1.5" title={STAGE_HINTS[s]}>
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: stageColor(s, isDark) }} />
                {STAGE_LABELS[s]} <span className="font-semibold">{summary.byStage[s].toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-ctl text-brand-600 dark:border-slate-500"
            checked={devDoneCounts}
            onChange={(e) => onDevDoneCountsChange(e.target.checked)}
          />
          Count &ldquo;Dev Completed&rdquo; and later as delivered
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Counts tickets with nothing nested under them, and leaves out dropped tickets (duplicate, out of scope, not a defect)
          {summary.byStage.dropped > 0 ? ` — ${summary.byStage.dropped} here` : ""}.
        </p>
      </div>
    </div>
  );
}
