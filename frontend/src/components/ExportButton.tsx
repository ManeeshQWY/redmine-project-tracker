import { useState } from "react";
import { exportReport, ReportSheet } from "../utils/reportExport";

interface Props {
  /** Builds the sheets at click time, from what the screen is showing then. */
  build: () => ReportSheet[];
  filenamePrefix: string;
  projectLabel: string;
  label?: string;
  disabled?: boolean;
}

const buttonCls =
  "rounded-md border border-ctl bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700";

/** Downloads the screen's report as an Excel workbook. */
export default function ExportButton({ build, filenamePrefix, projectLabel, label = "Export to Excel", disabled }: Props) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function run() {
    setBusy(true);
    setFailed(false);
    try {
      await exportReport(build(), filenamePrefix, projectLabel);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={run} disabled={disabled || busy} className={buttonCls}>
        {busy ? "Exporting…" : label}
      </button>
      {failed && <span className="text-xs text-rose-600 dark:text-rose-400">The export failed — try again.</span>}
    </span>
  );
}
