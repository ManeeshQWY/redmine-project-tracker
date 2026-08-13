import { Issue } from "../types/issue";
import { countClosed, countNotClosed } from "../utils/aggregations";

interface Props {
  issues: Issue[];
}

function Card({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex-1 min-w-[140px] rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone ?? "text-slate-800"}`}>{value.toLocaleString()}</div>
    </div>
  );
}

export default function KpiCards({ issues }: Props) {
  const total = issues.length;
  const closed = countClosed(issues);
  const notClosed = countNotClosed(issues);
  const bugs = issues.filter((i) => i.tracker === "Bug").length;
  const features = issues.filter((i) => i.tracker === "Feature").length;
  const highPriority = issues.filter((i) => i.priority === "High" || i.priority === "Urgent" || i.priority === "Immediate").length;
  const inProgress = issues.filter((i) => i.status.toLowerCase().includes("progress")).length;

  return (
    <div className="flex flex-wrap gap-3">
      <Card label="Total Tickets" value={total} />
      <Card label="Closed Tickets" value={closed} tone="text-emerald-600" />
      <Card label="Not Closed" value={notClosed} tone="text-amber-600" />
      <Card label="Bugs" value={bugs} tone="text-rose-600" />
      <Card label="Features" value={features} tone="text-brand-600" />
      <Card label="High Priority" value={highPriority} tone="text-rose-600" />
      <Card label="In Progress" value={inProgress} tone="text-brand-600" />
    </div>
  );
}
