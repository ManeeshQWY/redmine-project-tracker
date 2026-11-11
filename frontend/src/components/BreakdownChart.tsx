import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CountBucket } from "../utils/aggregations";
import { chartTheme, primarySeriesColor, useTheme } from "../theme";

interface Props {
  title: string;
  data: CountBucket[];
  maxBars?: number;
  onBarClick?: (key: string) => void;
}

interface BarTooltipProps {
  active?: boolean;
  payload?: { payload: CountBucket }[];
  t: ReturnType<typeof chartTheme>;
  color: string;
}

/** Recharts' built-in contentStyle/labelStyle only theme the box and category label — the
 * value line falls back to Recharts' own hardcoded (black) itemStyle, which is unreadable
 * in dark mode. A fully custom content renderer avoids that entirely. */
function BarTooltip({ active, payload, t, color }: BarTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border px-3 py-2 text-xs shadow-lg" style={{ backgroundColor: t.tooltipBg, borderColor: t.tooltipBorder, color: t.tooltipText }}>
      <div className="mb-1 font-medium">{row.key}</div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
        {row.count} ({row.percent.toFixed(1)}%)
      </div>
    </div>
  );
}

/** One horizontal bar per category, in a single colour (the length carries the value, not the hue), with the value at the
 * end of each bar. A chart with only one category is just a number, so it is shown as one. */
export default function BreakdownChart({ title, data, maxBars = 10, onBarClick }: Props) {
  const { isDark } = useTheme();
  const t = chartTheme(isDark);
  const color = primarySeriesColor(isDark);
  const shown = data.slice(0, maxBars);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:p-5">
      <div className="mb-3">
        <h3 className="text-[15px] font-semibold leading-5 text-slate-900 dark:text-slate-50">{title}</h3>
        {onBarClick && shown.length > 1 && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Click a bar to filter the tickets</p>}
      </div>
      {shown.length === 1 ? (
        <button
          type="button"
          disabled={!onBarClick}
          onClick={onBarClick ? () => onBarClick(shown[0].key) : undefined}
          className="flex w-full items-center gap-3 rounded-lg bg-slate-50 px-4 py-3 text-left text-sm dark:bg-slate-800"
        >
          <span className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{shown[0].count.toLocaleString()}</span>
          <span className="text-slate-600 dark:text-slate-300">
            {shown[0].count === 1 ? "ticket" : "tickets"}, all <span className="font-semibold">{shown[0].key}</span>
          </span>
        </button>
      ) : (
        <div style={{ width: "100%", height: Math.max(120, shown.length * 36 + 24) }}>
          <ResponsiveContainer>
            <BarChart data={shown} layout="vertical" margin={{ left: 8, right: 36, top: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} vertical={false} stroke={t.grid} />
              <XAxis type="number" hide domain={[0, (max: number) => Math.ceil(max * 1.1)]} />
              <YAxis
                type="category"
                dataKey="key"
                width={140}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: t.tick }}
                tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
              />
              <Tooltip cursor={{ fill: isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.04)" }} content={(props) => <BarTooltip {...(props as unknown as BarTooltipProps)} t={t} color={color} />} />
              <Bar
                dataKey="count"
                fill={color}
                radius={[0, 4, 4, 0]}
                barSize={18}
                isAnimationActive={false}
                onClick={onBarClick ? (entry) => onBarClick(entry.key) : undefined}
                cursor={onBarClick ? "pointer" : undefined}
              >
                <LabelList dataKey="count" position="right" offset={6} fontSize={12} fill={t.tooltipText} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
