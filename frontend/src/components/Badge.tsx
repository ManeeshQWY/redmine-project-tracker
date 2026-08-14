interface StatusBadgeProps {
  status: string;
  isClosed: boolean;
}

/** Colors by statusIsClosed first (authoritative), then keyword heuristics for common
 * in-between states — never a hardcoded status-name list, since those are
 * instance-specific and vary (see backend README "API investigation"). */
export function StatusBadge({ status, isClosed }: StatusBadgeProps) {
  if (!status) return null;
  const lower = status.toLowerCase();

  let cls = "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"; // default: open/new
  if (isClosed) {
    cls = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  } else if (/progress|qa|review|released/.test(lower)) {
    cls = "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
  } else if (/hold|pending|deferred|awaiting|blocked/.test(lower)) {
    cls = "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  }

  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${cls}`}>{status}</span>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  if (!priority) return null;
  const lower = priority.toLowerCase();

  let cls = "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"; // default: normal
  if (/immediate|urgent/.test(lower)) {
    cls = "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
  } else if (/high/.test(lower)) {
    cls = "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300";
  } else if (/low/.test(lower)) {
    cls = "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400";
  }

  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${cls}`}>{priority}</span>;
}
