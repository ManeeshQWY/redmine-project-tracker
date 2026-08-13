import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CountBucket } from "../utils/aggregations";

const COLORS = ["#2563eb", "#7c3aed", "#0ea5e9", "#059669", "#d97706", "#dc2626", "#64748b", "#db2777", "#0891b2", "#65a30d"];

interface Props {
  title: string;
  data: CountBucket[];
  maxBars?: number;
}

export default function BreakdownChart({ title, data, maxBars = 10 }: Props) {
  const shown = data.slice(0, maxBars);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      <div style={{ width: "100%", height: Math.max(180, shown.length * 32) }}>
        <ResponsiveContainer>
          <BarChart data={shown} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="key" width={140} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value: number, _n, item) => [`${value} (${item.payload.percent.toFixed(1)}%)`, "Count"]} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {shown.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
