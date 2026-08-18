import { Issue } from "../types/issue";
import { countClosed, countNotClosed } from "../utils/aggregations";

interface Props {
  issues: Issue[];
}

function Card({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="relative flex-1 min-w-[140px] overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accent}`} />
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold text-slate-800 dark:text-slate-100">{value.toLocaleString()}</div>
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
      <Card label="Total Tickets" value={total} accent="bg-slate-400" />
      <Card label="Closed Tickets" value={closed} accent="bg-emerald-500" />
      <Card label="Not Closed" value={notClosed} accent="bg-amber-500" />
      <Card label="Bugs" value={bugs} accent="bg-rose-500" />
      <Card label="Features" value={features} accent="bg-brand-500" />
      <Card label="High Priority" value={highPriority} accent="bg-rose-500" />
      <Card label="In Progress" value={inProgress} accent="bg-brand-500" />
    </div>
  );
}
