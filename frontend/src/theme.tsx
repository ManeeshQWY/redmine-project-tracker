import { createContext, ReactNode, useContext, useEffect, useState } from "react";

interface ThemeContextValue {
  isDark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "rtt.theme";

function getInitialIsDark(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark") return true;
  if (stored === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(getInitialIsDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
  }, [isDark]);

  return <ThemeContext.Provider value={{ isDark, toggle: () => setIsDark((d) => !d) }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/**
 * Categorical series colours, in fixed slot order — a validated set (colour-blind separation and lightness checked
 * against the card colour in both themes). A colour belongs to the thing it stands for, never to its rank.
 */
export const SERIES = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
} as const;

/** For "everything else" when a chart has more series than slots. */
export const OTHER_COLOR = { light: "#8a8a85", dark: "#8c8b83" } as const;

/** Trackers keep their slot in every chart, so Task is the same blue on Overview, Aging and the trend. */
const PINNED = ["task", "bug", "story", "feature", "epic", "suggestion"];

/** The colour for a named series (a tracker, say): pinned names keep a fixed slot, others fall into the spare slots. */
export function seriesColor(name: string, isDark: boolean): string {
  const palette = isDark ? SERIES.dark : SERIES.light;
  const pinned = PINNED.indexOf(name.trim().toLowerCase());
  if (pinned >= 0) return palette[pinned];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[PINNED.length + (hash % (palette.length - PINNED.length))];
}

/** The one colour for a chart that has a single series (the first slot). */
export function primarySeriesColor(isDark: boolean): string {
  return (isDark ? SERIES.dark : SERIES.light)[0];
}

/** Recharts renders raw SVG and can't pick up Tailwind's dark: classes on tick/grid/tooltip text — these give plain color values for that. */
export function chartTheme(isDark: boolean) {
  return {
    tick: isDark ? "#94a3b8" : "#64748b",
    surface: isDark ? "#0f172a" : "#ffffff", // the card colour: the gap between touching segments
    grid: isDark ? "#1e293b" : "#e2e8f0",
    tooltipBg: isDark ? "#1e293b" : "#ffffff",
    tooltipBorder: isDark ? "#334155" : "#e2e8f0",
    tooltipText: isDark ? "#e2e8f0" : "#1e293b",
  };
}
