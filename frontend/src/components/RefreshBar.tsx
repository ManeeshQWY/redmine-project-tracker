import { formatDateTime } from "../utils/format";
import { DownloadIcon, RefreshIcon } from "./icons";

interface Props {
  lastRefreshed: string | null;
  lastFetchDurationMs: number | null;
  loading: boolean;
  onRefresh: () => void;
  onExport: () => void;
  exportDisabled: boolean;
}

export default function RefreshBar({ lastRefreshed, lastFetchDurationMs, loading, onRefresh, onExport, exportDisabled }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {lastRefreshed && (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Refreshed {formatDateTime(lastRefreshed)}
          {lastFetchDurationMs !== null && ` · ${(lastFetchDurationMs / 1000).toFixed(1)}s`}
        </span>
      )}
      <button
        onClick={onExport}
        disabled={exportDisabled}
        className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        <DownloadIcon className="h-3.5 w-3.5" />
        Export to Excel
      </button>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshIcon className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Refreshing…" : "Refresh Data"}
      </button>
    </div>
  );
}
