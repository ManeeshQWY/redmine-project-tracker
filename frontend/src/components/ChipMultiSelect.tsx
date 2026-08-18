interface Props {
  label: string;
  options: string[];
  selected: string[]; // [] = All
  onChange: (next: string[]) => void;
}

/** Reusable "All" + toggle-chip multi-select, e.g. the global tracker filter. */
export default function ChipMultiSelect({ label, options, selected, onChange }: Props) {
  const chipCls = (active: boolean) =>
    `rounded-full px-2.5 py-1 text-[11px] font-medium ${
      active
        ? "bg-brand-600 text-white"
        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
    }`;

  function toggle(option: string) {
    onChange(selected.includes(option) ? selected.filter((o) => o !== option) : [...selected, option]);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}:</span>
      <button onClick={() => onChange([])} className={chipCls(selected.length === 0)}>
        All
      </button>
      {options.map((option) => (
        <button key={option} onClick={() => toggle(option)} className={chipCls(selected.includes(option))}>
          {option}
        </button>
      ))}
    </div>
  );
}
