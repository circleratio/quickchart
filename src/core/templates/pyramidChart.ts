import type { OutlineNode } from "../model/document";
import type { ThemeColorSlot } from "../model/style";
import { decoration, fixedText, shapeNode, textNode } from "./layoutNode";
import type { LayoutNode } from "./layoutNode";
import { LOCKED_LEAF, TITLE_EDITOR, emptyNode, emptyNodes, stringListParam, stringParam } from "./patternDefinition";
import type { PatternDefinition, RawParams } from "./patternDefinition";

const PYRAMID_WIDTH = 260;
const COLUMN_WIDTH = 200;
const ROW_HEIGHT = 100;
const TITLE_HEIGHT = 32;
const COLUMN_HEADER_HEIGHT = 32;
const ITEM_LABEL_HEIGHT = 26;
const SCALE_LABEL_HEIGHT = 20;
const CELL_HEIGHT = 24;
const TITLE_FONT_SIZE = 20;
const HEADER_FONT_SIZE = 15;
const ITEM_LABEL_FONT_SIZE = 18;
const SCALE_LABEL_FONT_SIZE = 13;
const CELL_FONT_SIZE = 15;

// The darkest-to-lightest shade for pyramid level `i` (0 = the apex/top
// level) - clamped to the theme's 5-shade primary scale (style.ts), same
// clamping idea as bulletMatrix/headingBullets reusing a fixed slot range.
function bandColorSlot(i: number): ThemeColorSlot {
  return Math.min(i, 4) as ThemeColorSlot;
}

// A pyramid level's own trapezoid (triangle for the apex level), as vertex
// fractions of its own bounding box (x: [0,1] across PYRAMID_WIDTH, y: [0,1]
// across this one row's height) - see shape.ts's PolygonShape for why
// fractions rather than absolute points. `rowCount` levels stacked top-to-
// bottom taper linearly from a point at the very top (level 0's top edge has
// zero width) to full PYRAMID_WIDTH at the bottom of the last level.
function bandPoints(levelIndex: number, rowCount: number): { x: number; y: number }[] {
  const topHalf = levelIndex / rowCount / 2;
  const bottomHalf = (levelIndex + 1) / rowCount / 2;
  return [
    { x: 0.5 - topHalf, y: 0 },
    { x: 0.5 + topHalf, y: 0 },
    { x: 0.5 + bottomHalf, y: 1 },
    { x: 0.5 - bottomHalf, y: 1 },
  ];
}

// "ピラミッド図" (doc/spec.md §6.2.5): a pyramid sliced into one band per
// outline root (apex first), each band's row extending into a table row to
// its right - one cell per `columnHeaders` entry, plus an overall title above
// the whole thing. Unlike pyramid.ts's tree-structured "ピラミッドストラクチャー"
// (§6.2), the hierarchy here is fixed at 2 levels and position-based, same
// idea as bulletMatrix (§6.2.4): a root (depth 0) is one pyramid level, and
// its children (depth 1) are position-aligned - child[0] is that level's
// "regbo/scale" label shown inside the band itself, child[1..] are this row's
// table cells aligned with `columnHeaders` by index (their own text is
// unused, like bulletMatrix's column headers - see bulletMatrixColumnHeaders
// in sync.ts).
export function layoutPyramidChart(outline: OutlineNode[], columnHeaders: string[], title: string): LayoutNode[] {
  const result: LayoutNode[] = [];
  const rowCount = outline.length;
  const totalWidth = PYRAMID_WIDTH + columnHeaders.length * COLUMN_WIDTH;

  if (title.trim()) {
    result.push(fixedText(title, {
      x: 0,
      y: -(COLUMN_HEADER_HEIGHT + TITLE_HEIGHT),
      width: totalWidth,
      height: TITLE_HEIGHT,
      kind: "label",
      align: "center",
      fontWeight: "bold",
      fontSize: TITLE_FONT_SIZE,
    }));
    // Solid divider between the title and the column-header row, spanning the
    // whole diagram width (pyramid column included) - unlike the dashed
    // row-to-row separators below, which only span the table region.
    result.push(decoration({
      x: 0,
      y: -COLUMN_HEADER_HEIGHT,
      width: totalWidth,
      height: 0,
      kind: "line",
      dashed: false,
    }));
  }

  columnHeaders.forEach((header, j) => {
    result.push(fixedText(header, {
      x: PYRAMID_WIDTH + j * COLUMN_WIDTH,
      y: -COLUMN_HEADER_HEIGHT,
      width: COLUMN_WIDTH,
      height: COLUMN_HEADER_HEIGHT,
      kind: "label",
      align: "center",
      underline: true,
      fontSize: HEADER_FONT_SIZE,
    }));
  });

  outline.forEach((row, i) => {
    const y = i * ROW_HEIGHT;
    const slot = bandColorSlot(i);

    // The band's fill first, so it renders underneath the item/scale labels
    // drawn on top of it (see regenerateBlockShapes in sync.ts) - same
    // ordering reason as matrix.ts's background square.
    result.push(shapeNode(row, {
      x: 0,
      y,
      width: PYRAMID_WIDTH,
      height: ROW_HEIGHT,
      kind: "polygon",
      points: bandPoints(i, rowCount),
      fillColorSlot: slot,
    }));

    // The item-name/scale labels sit directly on top of the band above, whose
    // fill goes from a dark shade at the apex to a light one at the base
    // (bandColorSlot) - contrastBgColorSlot picks legible (white-or-dark)
    // text for whichever shade this particular level landed on, rather than
    // a color fixed regardless of the band underneath (see style.ts's
    // contrastTextColor).
    result.push(textNode(row, 0, {
      x: 0,
      y: y + ROW_HEIGHT / 2 - ITEM_LABEL_HEIGHT,
      width: PYRAMID_WIDTH,
      height: ITEM_LABEL_HEIGHT,
      kind: "label",
      align: "center",
      fontWeight: "bold",
      fontSize: ITEM_LABEL_FONT_SIZE,
      contrastBgColorSlot: slot,
    }));

    const scale = row.children[0];
    if (scale) {
      result.push(textNode(scale, 1, {
        x: 0,
        y: y + ROW_HEIGHT / 2,
        width: PYRAMID_WIDTH,
        height: SCALE_LABEL_HEIGHT,
        kind: "label",
        align: "center",
        fontSize: SCALE_LABEL_FONT_SIZE,
        contrastBgColorSlot: slot,
      }));
    }

    columnHeaders.forEach((_, j) => {
      const cell = row.children[1 + j];
      if (!cell) return;
      result.push(textNode(cell, 1, {
        x: PYRAMID_WIDTH + j * COLUMN_WIDTH,
        y: y + ROW_HEIGHT / 2 - CELL_HEIGHT / 2,
        width: COLUMN_WIDTH,
        height: CELL_HEIGHT,
        kind: "label",
        align: "center",
        fontSize: CELL_FONT_SIZE,
      }));
    });

    // Dashed separator between this row and the next (not above the first or
    // below the last), spanning only the table region - the pyramid column
    // is already visually divided by each band's own distinct color, unlike
    // headingBullets' single-color heading column which needed this trick to
    // read as separate rows at all.
    if (columnHeaders.length > 0 && i < rowCount - 1) {
      result.push(decoration({
        x: PYRAMID_WIDTH,
        y: y + ROW_HEIGHT,
        width: columnHeaders.length * COLUMN_WIDTH,
        height: 0,
        kind: "line",
      }));
    }
  });

  return result;
}

// Table column headers (doc/spec.md §6.2.5) - same params shape as
// bulletMatrix's.
export function pyramidChartColumnHeaders(params: RawParams): string[] {
  return stringListParam(params, "columnHeaders");
}

export const pyramidChartPattern: PatternDefinition = {
  label: "ピラミッド図",
  layout: (outline, params) => layoutPyramidChart(outline, pyramidChartColumnHeaders(params), stringParam(params, "title")),
  normalizeOrigin: true,
  // A band's taper depends on its index among its siblings, which
  // relayoutBlock (repositioning only) would leave stale after a reorder.
  restructure: "regenerate",
  // A row needs its "scale" child plus one empty cell per column up front,
  // for the same reason as bulletMatrix's rows.
  newRoot: (params) => emptyNode(emptyNodes(1 + pyramidChartColumnHeaders(params).length)),
  // Same column resize as bulletMatrix's, except child[0] (the "scale"
  // label) is reserved and always kept.
  onParamsChange: (outline, params, patch) => {
    if (!("columnHeaders" in patch)) return { outline, params };
    const columnCount = pyramidChartColumnHeaders(params).length;
    return {
      params,
      outline: outline.map((row) => ({
        ...row,
        children: [row.children[0] ?? emptyNode(), ...Array.from({ length: columnCount }, (_, i) => row.children[1 + i] ?? emptyNode())],
      })),
    };
  },
  paramEditors: [TITLE_EDITOR, { kind: "list", key: "columnHeaders", heading: "列見出し" }],
  // child[0] (scale) and child[1..] (cells) are position-aligned leaf values.
  nodeRule: ({ depth }) => (depth === 1 ? LOCKED_LEAF : {}),
};
