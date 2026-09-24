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
// reference (see layoutNode.ts's Paint and textColorSlot) instead of a
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
// and layoutNode.ts's contrastBgColorSlot). Unlike headingStyle's
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

// A filled closed shape (ellipse/rect) whose own fill IS its identity -
// horizontalFlow's step circles (doc/spec.md §6.2.8), which - unlike every
// other filled generated shape so far - has no text of its own (its labels
// are separate "label"-kind shapes drawn on top, same layering as venn's set
// name over its circle). Plain fill+stroke only, since there's no text here
// for headingStyle's font/textColor fields to apply to.
export function filledShapeStyle(themeId: string = DEFAULT_COLOR_THEME_ID, fillColorSlot: ThemeColorSlot): ShapeStyle {
  const theme = getColorTheme(themeId);
  const fill = resolveColorSlot(theme, fillColorSlot);
  return { fill, stroke: fill, strokeWidth: 2 };
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

// Parent-child connector lines for ツリー図 ("pyramid" pattern - see
// pyramid.ts's regenerateTreeConnectors in sync.ts). Deliberately a fixed
// pale gray rather than a theme color: the connecting lines are meant to read
// as neutral structure regardless of which color theme (or how dark the
// node's own fill) is in use, matching a typical org-chart/tree-diagram look.
export function treeConnectorStyle(): ShapeStyle {
  return { fill: "none", stroke: "#c7c7c7", strokeWidth: 1.5 };
}

// タイムライン's vertical track (templates/timeline.ts, doc/spec.md §6.2.11) -
// the same fixed, theme-independent pale gray as treeConnectorStyle (a
// structural guide, not themed content) but visibly thicker, matching the
// reference image's chunky bar rather than a thin connector line. Kept as its
// own function rather than a treeConnectorStyle parameter since the two
// express different roles (a tree's parent-child link vs. a timeline's single
// continuous axis) even though their color coincides.
export function timelineTrackStyle(): ShapeStyle {
  return { fill: "none", stroke: "#c7c7c7", strokeWidth: 6 };
}

// A fixed, theme-independent light gray panel fill - ビフォーアフター（縦）'s
// "ASIS" (before/problem) cell background (templates/beforeAfter.ts, doc/
// spec.md §6.2.12). Deliberately NOT a theme color, unlike its "TOBE"
// (after/future) counterpart, which uses the theme's own palest shade
// (filledShapeStyle with a light fillColorSlot): the reference image reads
// the neutral "before" state as plain/unbranded and the "after" state as the
// one that gets the brand's color, so baking a theme color into the ASIS
// panel would undercut that contrast regardless of which color theme is
// active.
export function neutralPanelStyle(): ShapeStyle {
  return { fill: "#f2f2f2", stroke: "#f2f2f2", strokeWidth: 2 };
}

// Unfilled, stroked in a chosen theme shade - a generated shape's outline or a
// generated line (layoutNode.ts's `{ stroke }` paint): venn's set circles and
// matrix's quadrant boxes (a structural backdrop that leaves the labels on
// top legible), chevronFlow's open-sided outlines, a solid rule under a
// title, or - dashed, in a mid-tone shade - a subtle separator between rows.
// A thinner stroke than 2 wouldn't render any thinner (ShapeRenderer's own
// floor for an unstyled line).
export function strokeOnlyStyle(themeId: string = DEFAULT_COLOR_THEME_ID, strokeColorSlot: ThemeColorSlot, dashed = false): ShapeStyle {
  const theme = getColorTheme(themeId);
  return { fill: "none", stroke: resolveColorSlot(theme, strokeColorSlot), strokeWidth: 2, ...(dashed ? { strokeDasharray: "4 3" } : {}) };
}
