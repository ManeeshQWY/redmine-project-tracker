import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Issue } from "../types/issue";
import { bucketAgingByTracker, TrackerBucketRow } from "../utils/aggregations";
import { chartTheme, seriesColor, useTheme } from "../theme";

interface BucketTooltipProps {
  active?: boolean;
  payload?: { dataKey: string | number; value?: number; color?: string; payload: TrackerBucketRow }[];
  label?: string;
  t: ReturnType<typeof chartTheme>;
}

function BucketTooltip({ active, payload, label, t }: BucketTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload[0]?.payload.total ?? 0;
  return (
    <div className="rounded-md border px-3 py-2 text-xs shadow-sm" style={{ backgroundColor: t.tooltipBg, borderColor: t.tooltipBorder, color: t.tooltipText }}>
      <div className="mb-1 font-medium">{label}</div>
      {payload
        .filter((p) => (p.value ?? 0) > 0)
        .map((p) => (
          <div key={p.dataKey as string} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />{p.dataKey}</span>
            <span>{p.value}</span>
          </div>
        ))}
      <div className="mt-1 flex items-center justify-between gap-4 border-t pt-1 font-medium" style={{ borderColor: t.tooltipBorder }}>
        <span>Total</span>
        <span>{total}</span>
      </div>
    </div>
  );
}

/** Tracker-level breakdown of the same open-ticket aging buckets shown in AgingPanel — a
 * second view onto the same data, not a replacement (the existing chart stays as-is). */
export default function AgingByTrackerPanel({ issues }: { issues: Issue[] }) {
  const { isDark } = useTheme();
  const t = chartTheme(isDark);
  const { rows, trackers } = useMemo(() => bucketAgingByTracker(issues), [issues]);
  const chartData = rows.map((r) => ({ bucket: r.bucket, total: r.total, ...r.byTracker }));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Ticket Aging by Tracker</h3>
        <div style={{ width: "100%", height: Math.max(220, rows.length * 40) }}>
          <ResponsiveContainer>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke={t.grid} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: t.tick }} />
              <YAxis type="category" dataKey="bucket" width={80} tick={{ fontSize: 12, fill: t.tick }} />
              <Tooltip content={(props) => <BucketTooltip {...(props as unknown as BucketTooltipProps)} t={t} />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: t.tooltipText }}>{v}</span>} />
              {trackers.map((tracker) => (
                <Bar key={tracker} dataKey={tracker} stackId="aging" fill={seriesColor(tracker, isDark)} stroke={t.surface} strokeWidth={2} maxBarSize={44} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Aging by Tracker (Table)</h3>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-2 py-1.5">Age Bucket</th>
                {trackers.map((tracker) => (
                  <th scope="col" key={tracker} className="px-2 py-1.5 text-right">{tracker}</th>
                ))}
                <th scope="col" className="px-2 py-1.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.bucket} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1.5">{row.bucket}</td>
                  {trackers.map((tracker) => (
                    <td key={tracker} className="px-2 py-1.5 text-right">{row.byTracker[tracker] ?? 0}</td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-semibold">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
