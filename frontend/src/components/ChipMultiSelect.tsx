interface Props {
  label: string;
  options: string[];
  selected: string[]; // [] = All
  onChange: (next: string[]) => void;
}

/** Reusable "All" + toggle-chip multi-select, e.g. the global tracker filter. */
export default function ChipMultiSelect({ label, options, selected, onChange }: Props) {
  const chipCls = (active: boolean) =>
    `inline-flex h-7 items-center rounded-full px-3 text-xs font-medium transition-colors ${
      active
        ? "bg-brand-600 text-white"
        : "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600 dark:hover:bg-slate-700"
    }`;

  function toggle(option: string) {
    onChange(selected.includes(option) ? selected.filter((o) => o !== option) : [...selected, option]);
  }

  return (
    <div role="group" aria-label={`Filter by ${label.toLowerCase()}`} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-medium text-slate-600 dark:text-slate-400">{label}:</span>
      <button type="button" aria-pressed={selected.length === 0} onClick={() => onChange([])} className={chipCls(selected.length === 0)}>
        All
      </button>
      {options.map((option) => (
        <button type="button" key={option} aria-pressed={selected.includes(option)} onClick={() => toggle(option)} className={chipCls(selected.includes(option))}>
          {option}
        </button>
      ))}
    </div>
  );
}
