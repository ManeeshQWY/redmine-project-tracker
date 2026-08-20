interface IconProps {
  className?: string;
}

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const TAB_PATHS: Record<string, string> = {
  overview: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  tickets: "M4 6h16M4 12h16M4 18h10",
  aging: "M12 8v4l3 3",
  release: "M12 2c3 3 5 7 5 11a5 5 0 01-10 0c0-4 2-8 5-11z",
  qa: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3zM9 12l2 2 4-4",
  time: "M12 13V9M9 3h6",
  closedTrend: "M3 17l6-6 4 4 8-8M15 6h6v6",
  myAssigned: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-4 4-6 8-6s8 2 8 6",
};

/** Small outline icon set for the tab navigation — approximate, not pixel-perfect
 * heroicons, but enough to give each tab a distinct visual anchor in the sidebar. */
export function TabIcon({ id, className }: { id: string; className?: string }) {
  const d = TAB_PATHS[id];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE}>
      <path d={d} />
      {id === "aging" || id === "time" ? <circle cx={12} cy={12} r={9} /> : null}
    </svg>
  );
}

export function LogoMark({ className }: IconProps) {
  return (
    <div className={className}>
      <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6h16M4 12h10M4 18h13" />
      </svg>
    </div>
  );
}

export function RefreshIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE}>
      <path d="M4 4v5h5M20 20v-5h-5" />
      <path d="M4.5 15a8 8 0 0014.5 3.5M19.5 9A8 8 0 005 5.5" />
    </svg>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE}>
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />
    </svg>
  );
}

export function ChatIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE}>
      <path d="M4 5h16v11H8l-4 4V5z" />
    </svg>
  );
}

export function SendIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE}>
      <path d="M4 12l16-8-6 8 6 8-16-8z" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
