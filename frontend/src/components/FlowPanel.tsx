import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartTheme, useTheme } from "../theme";
import { Issue } from "../types/issue";
import { buildFlow, FlowGranularity, wipByAssignee } from "../utils/flow";
import { flowSheets } from "../utils/reportSheets";
import ExportButton from "./ExportButton";
import NumberInput from "./NumberInput";
import { STATUS_COLORS } from "../utils/parentProgress";

interface Props {
  issues: Issue[]; // the tickets the filters leave in
  allIssues?: Issue[]; // every loaded ticket, to tell which have children (defaults to `issues`)
  projectLabel?: string;
  now?: Date;
}

const selectCls =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";

interface TipProps {
  active?: boolean;
  label?: string;
  payload?: { dataKey: string; value?: number; name?: string; color?: string }[];
  t: ReturnType<typeof chartTheme>;
}

/** Custom tooltip: Recharts' own one leaves the value lines black in dark mode. */
function FlowTooltip({ active, label, payload, t }: TipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border px-3 py-2 text-xs shadow-sm" style={{ backgroundColor: t.tooltipBg, borderColor: t.tooltipBorder, color: t.tooltipText }}>
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Work arriving vs leaving, the backlog it leaves behind, how long closing takes, and who is juggling too much. */
export default function FlowPanel({ issues, allIssues, projectLabel = "project", now }: Props) {
  const { isDark } = useTheme();
  const t = chartTheme(isDark);
  const [by, setBy] = useState<FlowGranularity>("week");
  const [wipLimit, setWipLimit] = useState(5);
  const palette = isDark ? STATUS_COLORS.dark : STATUS_COLORS.light;

  const periods = useMemo(() => buildFlow(issues, now ?? new Date(), by), [issues, by, now]);
  const wip = useMemo(
    () => wipByAssignee(allIssues ?? issues, wipLimit, new Set(issues.map((i) => i.id))),
    [allIssues, issues, wipLimit]
  );

  if (periods.length === 0) return null;
  const days = (n: number | null) => (n === null ? "—" : `${n} d`);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Flow: created vs closed, and the backlog</h3>
          <span className="flex items-center gap-2">
            <ExportButton build={() => flowSheets(periods, wip)} filenamePrefix="redmine_flow" projectLabel={projectLabel} label="Export flow" />
            <select aria-label="Group flow by" value={by} onChange={(e) => setBy(e.target.value as FlowGranularity)} className={selectCls}>
            <option value="week">By week</option>
            <option value="month">By month</option>
          </select>
          </span>
        </div>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Bars are tickets created and closed in each period; the line is how many tickets were still open at the end of it. A backlog line that
          keeps climbing means work arrives faster than it leaves.
        </p>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <ComposedChart data={periods} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={t.grid} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: t.tick }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: t.tick }} />
              <Tooltip cursor={{ fill: "transparent" }} content={(props) => <FlowTooltip {...(props as unknown as TipProps)} t={t} />} />
              <Legend wrapperStyle={{ fontSize: 11, color: t.tick }} />
              <Bar dataKey="created" name="Created" fill={palette[0]} isAnimationActive={false} />
              <Bar dataKey="closed" name="Closed" fill={palette[2]} isAnimationActive={false} />
              <Line dataKey="backlog" name="Open at period end" stroke={palette[1]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 max-h-72 overflow-auto">
          <table className="w-full text-left text-xs" aria-label="Flow by period">
            <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1.5">Period</th>
                <th className="px-2 py-1.5 text-right">Created</th>
                <th className="px-2 py-1.5 text-right">Closed</th>
                <th className="px-2 py-1.5 text-right">Open at end</th>
                <th className="px-2 py-1.5 text-right" title="Median days from created to closed, for tickets closed in the period">Median days to close</th>
                <th className="px-2 py-1.5 text-right" title="9 in 10 tickets closed in the period took no longer than this">Slowest 10% start at</th>
              </tr>
            </thead>
            <tbody>
              {[...periods].reverse().map((p) => (
                <tr key={p.key} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1.5">{p.label}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.created}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.closed}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.backlog}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{days(p.cycleMedian)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{days(p.cycleP90)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Work in progress per person</h3>
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Flag above
            <NumberInput value={wipLimit} min={1} max={99} integer onCommit={setWipLimit} className="w-14 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" aria-label="Flag above" />
          </label>
        </div>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Tickets currently In Progress (with nothing nested under them). Someone with many at once is usually switching, not finishing.
        </p>
        {wip.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">Nothing is in progress.</p>
        ) : (
          <table className="w-full text-left text-xs" aria-label="Work in progress per person">
            <tbody>
              {wip.map((w) => (
                <tr key={w.assignee} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1.5">{w.assignee}</td>
                  <td className={`w-24 px-2 py-1.5 text-right tabular-nums ${w.overLimit ? "font-semibold text-rose-600 dark:text-rose-400" : ""}`}>{w.active}</td>
                  <td className="w-28 px-2 py-1.5 text-[11px] text-rose-600 dark:text-rose-400">{w.overLimit ? "over the limit" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
