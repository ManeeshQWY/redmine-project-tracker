import { useEffect, useState } from "react";

interface Props {
  message: string;
  approxTotal?: number | null;
  onCancel?: () => void;
}

/** No exact page-by-page progress is available for a single request/response fetch (see
 * README — real page-by-page progress would need a polling/streaming endpoint), but a
 * cheap upfront count call (see api.ts getIssueCount) gives an approximate total, which
 * combined with a live elapsed-seconds counter makes a 15-60s wait feel a lot less dead. */
export default function LoadingIndicator({ message, approxTotal, onCancel }: Props) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => setElapsedMs(Date.now() - start), 250);
    return () => clearInterval(interval);
  }, []);

  return (
    <div role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-10">
      <div aria-hidden className="mx-auto mb-8 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-200/70 motion-reduce:animate-none dark:bg-slate-800/70" />
        ))}
      </div>
      <p className="text-slate-600 dark:text-slate-400">{message}</p>
      {approxTotal !== null && approxTotal !== undefined && (
        <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">~{approxTotal.toLocaleString()} tickets to load</p>
      )}
      <div className="mx-auto mt-5 h-1.5 w-64 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full w-1/3 animate-[loading-slide_1.2s_ease-in-out_infinite] rounded-full bg-brand-500" />
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{(elapsedMs / 1000).toFixed(0)}s elapsed</p>
      {onCancel && (
        <button
          onClick={onCancel}
          className="mt-4 rounded-lg border border-ctl bg-white px-4 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
