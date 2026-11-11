import { Stage } from "./stages";

// Stage colours. The stages run from "not started" to "done", so they are shown as one blue ramp that gets
// stronger with progress (a neutral grey for "not started"), rather than a rainbow: "Done" is always the most
// prominent segment, and blocked work is the one amber note. Checked against the card colour in both themes.

export const STAGE_COLORS: Record<Stage, { light: string; dark: string }> = {
  notStarted: { light: "#94a3b8", dark: "#64748b" },
  active: { light: "#86b6ef", dark: "#184f95" },
  blocked: { light: "#eda100", dark: "#c98500" },
  devDone: { light: "#3987e5", dark: "#3987e5" },
  inQa: { light: "#2a78d6", dark: "#5598e7" },
  qaPassed: { light: "#184f95", dark: "#6da7ec" },
  done: { light: "#0d366b", dark: "#b7d3f6" },
  dropped: { light: "#8a8a85", dark: "#8c8b83" },
};

export function stageColor(stage: Stage, isDark: boolean): string {
  return isDark ? STAGE_COLORS[stage].dark : STAGE_COLORS[stage].light;
}
