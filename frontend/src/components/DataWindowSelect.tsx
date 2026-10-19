import { useEffect, useState } from "react";
import { DAY_OPTIONS, isValidRange, LoadWindow, windowKey } from "../utils/dataWindow";

interface Props {
  window: LoadWindow;
  onChange: (window: LoadWindow) => void;
  disabled?: boolean;
}

const CUSTOM = "custom";

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Picks the period to load: a preset ("Last 30 days" … "All time") or an exact date range.
 * Picking a preset loads right away; a custom range loads when "Apply" is clicked. */
export default function DataWindowSelect({ window, onChange, disabled }: Props) {
  const [editingRange, setEditingRange] = useState(false);
  const today = isoDay(new Date());
  const [from, setFrom] = useState(window.kind === "range" ? window.from : isoDay(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = useState(window.kind === "range" ? window.to : today);

  // When the period in force changes underneath us (for example a cancelled custom range
  // going back to the previous preset), stop showing the range editor.
  const currentKey = windowKey(window);
  useEffect(() => {
    setEditingRange(false);
  }, [currentKey]);

  const showRange = editingRange || window.kind === "range";
  const selectValue = showRange ? CUSTOM : String(window.kind === "days" ? window.days : 30);
  const valid = isValidRange(from, to);
  const dateCls =
    "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";

  function choose(value: string) {
    if (value === CUSTOM) {
      setEditingRange(true);
      return;
    }
    setEditingRange(false);
    onChange({ kind: "days", days: Number(value) });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label htmlFor="data-window" className="text-xs text-slate-500 dark:text-slate-400">
        Tickets updated in
      </label>
      <select
        id="data-window"
        value={selectValue}
        disabled={disabled}
        onChange={(e) => choose(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      >
        {DAY_OPTIONS.map((o) => (
          <option key={o.days} value={o.days}>
            {o.label}
          </option>
        ))}
        <option value={CUSTOM}>Custom range…</option>
      </select>

      {showRange && (
        <>
          <label htmlFor="data-window-from" className="text-xs text-slate-500 dark:text-slate-400">
            From
          </label>
          <input id="data-window-from" type="date" className={dateCls} value={from} max={to || today} disabled={disabled} onChange={(e) => setFrom(e.target.value)} />
          <label htmlFor="data-window-to" className="text-xs text-slate-500 dark:text-slate-400">
            To
          </label>
          <input id="data-window-to" type="date" className={dateCls} value={to} min={from} max={today} disabled={disabled} onChange={(e) => setTo(e.target.value)} />
          <button
            onClick={() => onChange({ kind: "range", from, to })}
            disabled={disabled || !valid || (window.kind === "range" && window.from === from && window.to === to)}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply
          </button>
        </>
      )}
    </div>
  );
}
