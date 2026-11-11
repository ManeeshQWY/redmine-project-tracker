import { useMemo } from "react";
import { useTheme } from "../theme";
import { Issue } from "../types/issue";
import { STATUS_COLORS } from "../utils/parentProgress";
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
  const palette = isDark ? STATUS_COLORS.dark : STATUS_COLORS.light;
  const colorOf = (stage: (typeof STAGE_ORDER)[number]) => palette[STAGE_ORDER.indexOf(stage)];
  const shown = STAGE_ORDER.filter((s) => s !== "dropped" && summary.byStage[s] > 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Delivery progress</h3>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={devDoneCounts} onChange={(e) => onDevDoneCountsChange(e.target.checked)} />
          Count &ldquo;Dev Completed&rdquo; and later as delivered
        </label>
      </div>

      <div className="mb-3 flex flex-wrap gap-6">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Delivered (tickets)</div>
          <div className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{pct(summary.deliveredPercent)}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {summary.delivered.toLocaleString()} of {summary.tickets.toLocaleString()} tickets
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400" title="Only tickets with nothing nested under them and an estimate count — a parent's own estimate is not added on top of its children's">
            Delivered (estimated hours)
          </div>
          <div className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{pct(summary.deliveredHoursPercent)}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {Math.round(summary.deliveredEstimatedHours).toLocaleString()} of {Math.round(summary.estimatedHours).toLocaleString()} h
            {summary.unestimated > 0 ? ` · ${summary.unestimated.toLocaleString()} with no estimate` : ""}
          </div>
          {summary.tickets > 0 && summary.unestimated / summary.tickets > 0.2 && (
            <div className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
              {Math.round((summary.unestimated / summary.tickets) * 100)}% of tickets have no estimate, so this figure is unreliable.
            </div>
          )}
        </div>
      </div>

      {summary.tickets === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">Nothing to deliver in this selection.</p>
      ) : (
        <>
          <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label="Tickets by stage">
            {shown.map((s) => (
              <div
                key={s}
                title={`${STAGE_LABELS[s]}: ${summary.byStage[s]}`}
                style={{ width: `${(summary.byStage[s] / summary.tickets) * 100}%`, background: colorOf(s) }}
              />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300" aria-label="Stage legend">
            {shown.map((s) => (
              <li key={s} className="flex items-center gap-1.5" title={STAGE_HINTS[s]}>
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colorOf(s) }} />
                {STAGE_LABELS[s]} <span className="font-medium">{summary.byStage[s].toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
        Counts tickets with nothing nested under them (so a parent and its children are not both counted), and leaves out dropped tickets
        (duplicate, out of scope, not a defect){summary.byStage.dropped > 0 ? ` — ${summary.byStage.dropped} here` : ""}.
      </p>
    </div>
  );
}
