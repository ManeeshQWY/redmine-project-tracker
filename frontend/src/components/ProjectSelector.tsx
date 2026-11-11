import { ProjectMeta } from "../types/issue";
import { ALL_PROJECTS } from "../services/api";

interface Props {
  projects: ProjectMeta[];
  selected: string | null;
  onSelect: (identifier: string) => void;
}

export default function ProjectSelector({ projects, selected, onSelect }: Props) {
  return (
    <label className="flex w-full min-w-0 items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 sm:w-auto">
      Project:
      <select
        className="w-full min-w-0 sm:w-auto sm:min-w-[260px] rounded-lg border border-ctl bg-white px-3 py-1.5 text-sm text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        value={selected ?? ""}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="" disabled>
          Select a project…
        </option>
        <option value={ALL_PROJECTS}>★ All Projects (entire instance)</option>
        {projects.map((p) => (
          <option key={p.identifier} value={p.identifier}>
            {p.parent ? `${p.parent} / ${p.name}` : p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
