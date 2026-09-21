export interface ShapeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
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

// Solid-filled, borderless text for a row heading that IS its own background
// (headingBullets' left-hand heading cell - see headingBullets.ts) - unlike
// defaultShapeStyle's light-fill-plus-border box, or matrix's separate
// background/title shapes, this is one shape doing both jobs since the whole
// cell is the heading (no separate "item area" to leave unfilled below it).
export function headingStyle(themeId: string = DEFAULT_COLOR_THEME_ID, fontSize = 16): ShapeStyle {
  const theme = getColorTheme(themeId);
  return {
    fill: theme.primary[0],
    stroke: theme.primary[0],
    strokeWidth: 2,
    fontFamily: "Yu Gothic, Meiryo, sans-serif",
    fontSize,
    fontWeight: "bold",
    textColor: theme.textLight,
  };
}

// Dashed rule between headingBullets' rows (see headingBullets.ts). Uses the
// theme's mid-tone shade rather than outlineStyle's dark primary[0] - a full
// row divider reads better as a subtle rule than a structural border. Wider
// than ShapeRenderer's own 2px floor for an unstyled line, so it reads as a
// deliberate rule rather than a hairline.
export function separatorStyle(themeId: string = DEFAULT_COLOR_THEME_ID): ShapeStyle {
  const theme = getColorTheme(themeId);
  return { fill: "none", stroke: theme.primary[2], strokeWidth: 3, strokeDasharray: "4 3" };
}
