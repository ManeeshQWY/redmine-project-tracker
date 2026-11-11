import { Issue } from "../types/issue";
import { countClosed, countNotClosed } from "../utils/aggregations";
import { quickCounts } from "../utils/insights";

interface Props {
  issues: Issue[];
}

const tileCls = "min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none";

/** One number and what it counts. `alert` turns it red when above zero: it is a count of things that should be none. */
function Tile({ label, value, hint, alert = false }: { label: string; value: number; hint?: string; alert?: boolean }) {
  const bad = alert && value > 0;
  return (
    <div className={tileCls}>
      <div className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</div>
      <div
        className={`mt-1 text-[28px] font-semibold leading-8 tracking-tight ${bad ? "text-rose-700 dark:text-rose-300" : "text-slate-900 dark:text-slate-50"}`}
      >
        {value.toLocaleString()}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
    </div>
  );
}

/** What needs attention first, then how big the work is. */
export default function KpiCards({ issues }: Props) {
  const closed = countClosed(issues);
  const open = countNotClosed(issues);
  const highPriority = issues.filter((i) => i.priority === "High" || i.priority === "Urgent" || i.priority === "Immediate").length;
  const inProgress = issues.filter((i) => i.status.toLowerCase().includes("progress")).length;
  const quick = quickCounts(issues, new Date());

  return (
    <div className="space-y-6">
      <section aria-labelledby="kpi-attention" className="space-y-2">
        <h3 id="kpi-attention" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Needs attention
        </h3>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Tile label="Overdue" value={quick.overdue} alert hint="Open and past the due date" />
          <Tile label="Unassigned" value={quick.unassigned} alert hint="Open, with no assignee" />
          <Tile label="No estimate" value={quick.noEstimate} alert hint="Open, with no estimated hours" />
          <Tile label="High priority" value={highPriority} hint="High, urgent or immediate" />
        </div>
      </section>

      <section aria-labelledby="kpi-volume" className="space-y-2">
        <h3 id="kpi-volume" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Volume
        </h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Tile label="Total tickets" value={issues.length} />
          <Tile label="Open" value={open} hint="Not in a closed status" />
          <Tile label="Closed" value={closed} hint="Status marked closed in Redmine" />
          <Tile label="In progress" value={inProgress} />
          <Tile label="Created (7 days)" value={quick.created7} />
          <Tile label="Closed (7 days)" value={quick.closed7} />
        </div>
        {closed === 0 && issues.length > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No ticket has a closed status here. Delivery progress above counts &ldquo;Dev Completed&rdquo; and later as delivered.
          </p>
        )}
      </section>
    </div>
  );
}
