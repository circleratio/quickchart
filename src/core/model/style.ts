export interface ShapeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline";
  textColor?: string;
}

// Consulting-deck-appropriate color theme preset (see doc/spec.md §7). Exact HEX
// values are an implementation detail the design phase left open; the 3 presets'
// direction (Neutral Blue / Warm Gray / Monochrome) is what's fixed.
export interface ColorTheme {
  id: string;
  name: string;
  primary: [string, string, string, string, string];
  accent: string;
  textDark: string;
  textLight: string;
}

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: "neutral-blue",
    name: "Neutral Blue",
    primary: ["#095a79", "#2e738d", "#74a2b3", "#bfd4dc", "#eff4f6"],
    accent: "#d98c3f",
    textDark: "#1f2933",
    textLight: "#ffffff",
  },
  {
    id: "warm-gray",
    name: "Warm Gray",
    primary: ["#5c4632", "#8a6f52", "#b79c7f", "#ddccb8", "#f6efe6"],
    accent: "#b5462f",
    textDark: "#3a2f22",
    textLight: "#ffffff",
  },
  {
    id: "monochrome",
    name: "Monochrome",
    primary: ["#1a1a1a", "#404040", "#737373", "#b3b3b3", "#f0f0f0"],
    accent: "#2563eb",
    textDark: "#1a1a1a",
    textLight: "#ffffff",
  },
];

export const DEFAULT_COLOR_THEME_ID = COLOR_THEMES[0].id;

export function getColorTheme(id: string): ColorTheme {
  return COLOR_THEMES.find((theme) => theme.id === id) ?? COLOR_THEMES[0];
}

// Index into a ColorTheme's `primary` shade scale (0 = darkest), or the
// theme's single `accent` color - lets a LayoutNode pick a theme color by
// reference (see treeLayout.ts's fillColorSlot/textColorSlot) instead of a
// pattern embedding a literal hex, which would break theme switching.
export type ThemeColorSlot = 0 | 1 | 2 | 3 | 4 | "accent";

export function resolveColorSlot(theme: ColorTheme, slot: ThemeColorSlot): string {
  return slot === "accent" ? theme.accent : theme.primary[slot];
}

// WCAG relative luminance (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance)
// of a "#rrggbb" color, in [0, 1].
function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Picks whichever of the theme's two text colors reads legibly against
// `backgroundHex` - white (`textLight`) on a dark background, the theme's
// usual dark text (`textDark`) on a light one. Used where a label sits
// directly on top of a shape whose own fill varies (pyramidChart's item-
// name/scale labels over their pyramid band, which goes from a dark shade at
// the apex to a light one at the base - see pyramidChart.ts's bandColorSlot
// and treeLayout.ts's contrastBgColorSlot). Unlike headingStyle's
// unconditional `textColor: theme.textLight` (safe there because every
// current heading fill is one of the theme's darker shades), this checks the
// actual color so it stays correct as the background darkness varies.
export function contrastTextColor(theme: ColorTheme, backgroundHex: string): string {
  return relativeLuminance(backgroundHex) < 0.5 ? theme.textLight : theme.textDark;
}

export function defaultShapeStyle(themeId: string = DEFAULT_COLOR_THEME_ID): ShapeStyle {
  const theme = getColorTheme(themeId);
  return {
    fill: theme.primary[4],
    stroke: theme.primary[0],
    strokeWidth: 2,
    fontFamily: "Yu Gothic, Meiryo, sans-serif",
    fontSize: 16,
    textColor: theme.primary[0],
  };
}

// An unfilled outline, for a generated shape that's a structural backdrop
// rather than a labeled box: venn's set circles (so overlap regions and the
// item labels placed on top stay legible) and a matrix quadrant's background
// square (so it doesn't double up on top of its own title/item labels, which
// keep the normal filled style).
export function outlineStyle(themeId: string = DEFAULT_COLOR_THEME_ID): ShapeStyle {
  const theme = getColorTheme(themeId);
  return { fill: "none", stroke: theme.primary[0], strokeWidth: 2 };
}

// Borderless text, for a generated label drawn directly on top of another
// shape rather than its own layer (Venn's set name inside its own circle -
// see venn.ts; headingBullets' bullet items over the content column - see
// headingBullets.ts). No fill/stroke so the box is invisible unless selected
// (ShapeRenderer swaps in the selection color/width then). `fontSize`
// defaults to defaultShapeStyle's 16px (a regular item label); Venn's set
// name passes a larger size since it reads as a title instead.
export function labelStyle(themeId: string = DEFAULT_COLOR_THEME_ID, fontSize = 16): ShapeStyle {
  const theme = getColorTheme(themeId);
  return {
    fill: "none",
    stroke: "none",
    strokeWidth: 2,
    fontFamily: "Yu Gothic, Meiryo, sans-serif",
    fontSize,
    textColor: theme.primary[0],
  };
}

// Solid-filled, borderless text for a heading cell that IS its own background
// (headingBullets' left-hand heading cell; bulletMatrix's row/column headers -
// see headingBullets.ts/bulletMatrix.ts) - unlike defaultShapeStyle's
// light-fill-plus-border box, or matrix's separate background/title shapes,
// this is one shape doing both jobs since the whole cell is the heading (no
// separate "item area" to leave unfilled below it). `fill` defaults to
// primary[0] (headingBullets' navy); bulletMatrix's row/column headers pass a
// different slot to tell them apart from each other and from a regular cell.
export function headingStyle(
  themeId: string = DEFAULT_COLOR_THEME_ID,
  fontSize = 16,
  fillColorSlot: ThemeColorSlot = 0,
): ShapeStyle {
  const theme = getColorTheme(themeId);
  const fill = resolveColorSlot(theme, fillColorSlot);
  return {
    fill,
    stroke: fill,
    strokeWidth: 2,
    fontFamily: "Yu Gothic, Meiryo, sans-serif",
    fontSize,
    fontWeight: "bold",
    textColor: theme.textLight,
  };
}

// Dashed rule between headingBullets' rows (see headingBullets.ts). Uses the
// theme's mid-tone shade rather than outlineStyle's dark primary[0] - a full
// row divider reads better as a subtle rule than a structural border. This is
// ShapeRenderer's own floor for an unstyled line (Math.max(strokeWidth, 2)) -
// a thinner value here wouldn't render any thinner.
export function separatorStyle(themeId: string = DEFAULT_COLOR_THEME_ID): ShapeStyle {
  const theme = getColorTheme(themeId);
  return { fill: "none", stroke: theme.primary[2], strokeWidth: 2, strokeDasharray: "4 3" };
}

// Solid rule, for a divider that reads as a structural boundary rather than a
// subtle row separator (pyramidChart's line under its title, between the
// title and the column-header row - see pyramidChart.ts). Same dark tone as
// outlineStyle, kept as its own named function since the two express
// different roles (a shape's own border vs. a standalone divider line) even
// though their values currently coincide.
export function ruleStyle(themeId: string = DEFAULT_COLOR_THEME_ID): ShapeStyle {
  const theme = getColorTheme(themeId);
  return { fill: "none", stroke: theme.primary[0], strokeWidth: 2 };
}
