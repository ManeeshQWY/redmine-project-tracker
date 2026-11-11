import { ReactNode } from "react";

/** A small heading that groups the cards under it on a long page. */
export default function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="pt-2 text-xs font-semibold uppercase tracking-wider text-slate-500 first:pt-0 dark:text-slate-400">{children}</h3>;
}
