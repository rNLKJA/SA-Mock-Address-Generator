/**
 * Map and chart colours. Ramps were checked with the dataviz palette validator
 * (ordinal mode: monotone lightness, visible steps, light end >= 2:1 on the
 * surface) against the paper (#f7f3e8) and night (#0f1822) surfaces.
 */
export type ThemeName = "light" | "dark";

/** Remoteness is ordinal: one ochre hue, darker = more remote (light theme). */
export const REMOTENESS_RAMP: Record<ThemeName, string[]> = {
  light: ["#d6a55c", "#c4873f", "#a9682c", "#864d22", "#5f3317"],
  dark: ["#7a4a22", "#9c6230", "#c08142", "#dca35c", "#f2c886"],
};

/** Grey for "Not Applicable" (2025 table) and for missing values. */
export const NEUTRAL: Record<ThemeName, string> = { light: "#a29d90", dark: "#56606b" };

/**
 * SEIFA IRSAD deciles are diverging around the state median: red arm for the
 * most disadvantaged deciles, blue arm for the most advantaged, lightest at
 * the middle.
 */
export const DECILE_RAMP: Record<ThemeName, string[]> = {
  light: [
    "#922a1f",
    "#b6402f",
    "#cc6450",
    "#de8b79",
    "#e9b0a2",
    "#a9c4e6",
    "#7fa7d9",
    "#5589c7",
    "#3369ad",
    "#1c4b88",
  ],
  dark: [
    "#f08a76",
    "#d96a56",
    "#b8503f",
    "#8f3d31",
    "#6a2f27",
    "#2b4a73",
    "#3a6398",
    "#4f80bd",
    "#6e9ddb",
    "#97bdf0",
  ],
};

export const POINT: Record<ThemeName, { fill: string; ring: string }> = {
  light: { fill: "#b8292f", ring: "#fbf8ef" },
  dark: { fill: "#ff8a7a", ring: "#0d1520" },
};

export const BOUNDARY: Record<ThemeName, { line: string; highlight: string }> = {
  light: { line: "#5b4a33", highlight: "#1f4e8c" },
  dark: { line: "#c9b998", highlight: "#8fb3e6" },
};

export const FALLBACK_BASEMAP: Record<
  ThemeName,
  { water: string; land: string; landSa: string; line: string }
> = {
  light: { water: "#dfe8ee", land: "#f1ebdc", landSa: "#f6f1e4", line: "#b5a98c" },
  dark: { water: "#0a1018", land: "#141e2a", landSa: "#18242f", line: "#3a4a5e" },
};
