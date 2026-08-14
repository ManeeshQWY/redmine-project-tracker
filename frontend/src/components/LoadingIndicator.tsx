import { useEffect, useState } from "react";

interface Props {
  message: string;
}

/** No exact progress is available from the backend for a single request/response fetch
 * (see README — real page-by-page progress would need a polling/streaming endpoint), so
 * this gives an indeterminate animated bar plus a live elapsed-seconds counter — enough
 * to make a 15-60s wait feel alive instead of dead. */
export default function LoadingIndicator({ message }: Props) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => setElapsedMs(Date.now() - start), 250);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
      <p className="text-slate-500 dark:text-slate-400">{message}</p>
      <div className="mx-auto mt-4 h-1.5 w-64 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className="h-full w-1/3 animate-[loading-slide_1.2s_ease-in-out_infinite] rounded-full bg-brand-500" />
      </div>
      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{(elapsedMs / 1000).toFixed(0)}s elapsed</p>
    </div>
  );
}
