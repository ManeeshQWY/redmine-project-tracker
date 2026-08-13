import { formatDateTime } from "../utils/format";

interface Props {
  lastRefreshed: string | null;
  loading: boolean;
  onRefresh: () => void;
  onExport: () => void;
  exportDisabled: boolean;
}

export default function RefreshBar({ lastRefreshed, loading, onRefresh, onExport, exportDisabled }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={onRefresh}
        disabled={loading}
        className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Refreshing…" : "Refresh Data"}
      </button>
      <button
        onClick={onExport}
        disabled={exportDisabled}
        className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Export to Excel
      </button>
      {lastRefreshed && (
        <span className="text-xs text-slate-500">Last Refreshed: {formatDateTime(lastRefreshed)}</span>
      )}
    </div>
  );
}
