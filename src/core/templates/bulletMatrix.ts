import type { OutlineNode } from "../model/document";
import { decoration, fixedText, textNode } from "./layoutNode";
import type { LayoutNode } from "./layoutNode";
import { emptyNode, emptyNodes, stringListParam } from "./patternDefinition";
import type { PatternDefinition, RawParams } from "./patternDefinition";

const ROW_HEADER_WIDTH = 160;
const COLUMN_WIDTH = 380;
const COLUMN_HEADER_HEIGHT = 48;
// Trimmed off the bottom of each row header cell so adjacent rows' blocks
// don't visually fuse into one band, same reasoning as headingBullets'
// HEADING_GAP (see headingBullets.ts).
const ROW_GAP = 4;
const ROW_MIN_HEIGHT = 70;
const CELL_PADDING_X = 20;
const CELL_PADDING_Y = 14;
const TITLE_HEIGHT = 22;
const DETAIL_HEIGHT = 18;
// Vertical gap between stacked lines within a cell (title-to-detail and
// detail-to-detail); GROUP_GAP is the extra breathing room between two
// different title's-worth-of-content, on top of one LINE_GAP.
const LINE_GAP = 4;
const GROUP_GAP = 10;
const DETAIL_INDENT = 14;
const TITLE_FONT_SIZE = 15;
const DETAIL_FONT_SIZE = 12;
const HEADER_FONT_SIZE = 16;

// A cell's own content height (title/detail lines stacked, no padding) - 0
// for an empty cell (no title groups yet).
function cellContentHeight(cell: OutlineNode): number {
  let height = 0;
  cell.children.forEach((title, i) => {
    if (i > 0) height += GROUP_GAP;
    height += TITLE_HEIGHT;
    height += title.children.length * (LINE_GAP + DETAIL_HEIGHT);
  });
  return height;
}

// Lays out one cell's title/detail lines top-down, offset from the cell's
// own top-left corner (originX, originY).
function layoutCellItems(cell: OutlineNode, originX: number, originY: number): LayoutNode[] {
  const result: LayoutNode[] = [];
  let y = originY + CELL_PADDING_Y;
  const contentWidth = COLUMN_WIDTH - CELL_PADDING_X * 2;

  cell.children.forEach((title, i) => {
    if (i > 0) y += GROUP_GAP;
    result.push(textNode(title, 2, {
      x: originX + CELL_PADDING_X,
      y,
      width: contentWidth,
      height: TITLE_HEIGHT,
      kind: "label",
      align: "left",
      fontSize: TITLE_FONT_SIZE,
      fontWeight: "bold",
      underline: true,
      bulletMarker: "• ",
    }));
    y += TITLE_HEIGHT;

    title.children.forEach((detail) => {
      y += LINE_GAP;
      result.push(textNode(detail, 3, {
        x: originX + CELL_PADDING_X + DETAIL_INDENT,
        y,
        width: contentWidth - DETAIL_INDENT,
        height: DETAIL_HEIGHT,
        kind: "label",
        align: "left",
        fontSize: DETAIL_FONT_SIZE,
        textColorSlot: 2,
        bulletMarker: "- ",
      }));
      y += DETAIL_HEIGHT;
    });
  });

  return result;
}

// "箇条書きマトリクス" (doc/spec.md §6.2.4): a row-header column (like
// headingBullets) crossed with column headers along the top, each cell
// holding its own 2-level bullet list (bold+underlined title, plain detail
// lines under it) - effectively headingBullets generalized to N columns
// instead of 1. Row order follows the outline's root order; column order
// follows `columnHeaders` (StructuredBlock.params.columnHeaders - not part of
// the outline text itself, same reasoning as matrix.ts's axis labels: column
// headers have no natural "parent" node to hang off of without duplicating
// the same label under every row).
//
// Outline shape: root (depth 0) = row, its children (depth 1) = cells
// (position-aligned with `columnHeaders`, not by text - a cell's own `text`
// is unused), a cell's children (depth 2) = title bullets, a title's children
// (depth 3) = detail lines under it.
export function layoutBulletMatrix(outline: OutlineNode[], columnHeaders: string[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  const columnCount = columnHeaders.length;
  const gridWidth = COLUMN_WIDTH * columnCount;

  // Row heights, computed once up front and reused below for placing the row
  // header/cells and for the horizontal grid lines between rows, instead of
  // recomputing per use. `cells[i]` is undefined for a row with fewer
  // children than columnCount - see layoutCellItems's own defensive check.
  const rows = outline.map((row) => {
    const cells = Array.from({ length: columnCount }, (_, i) => row.children[i]);
    const height = Math.max(ROW_MIN_HEIGHT, CELL_PADDING_Y * 2 + Math.max(0, ...cells.map((c) => (c ? cellContentHeight(c) : 0))));
    return { row, cells, height };
  });
  const gridBottom = rows.reduce((sum, r) => sum + r.height, 0);

  columnHeaders.forEach((header, i) => {
    result.push(fixedText(header, {
      x: ROW_HEADER_WIDTH + i * COLUMN_WIDTH,
      y: -COLUMN_HEADER_HEIGHT,
      width: COLUMN_WIDTH,
      height: COLUMN_HEADER_HEIGHT,
      kind: "heading",
      fontSize: HEADER_FONT_SIZE,
      italic: true,
      fillColorSlot: 1,
    }));
  });

  let y = 0;
  rows.forEach(({ row, cells, height }) => {
    result.push(textNode(row, 0, {
      x: 0,
      y,
      width: ROW_HEADER_WIDTH,
      height: height - ROW_GAP,
      kind: "heading",
      fontSize: HEADER_FONT_SIZE,
      fillColorSlot: "accent",
    }));

    cells.forEach((cell, i) => {
      if (!cell) return;
      result.push(...layoutCellItems(cell, ROW_HEADER_WIDTH + i * COLUMN_WIDTH, y));
    });

    y += height;
  });

  // Vertical grid lines: one before column 0 (separating it from the row
  // header) plus one between each pair of adjacent columns - columnCount
  // lines total, spanning from the top of the column headers down to the
  // bottom of the last row. No line after the last column (the grid's right
  // edge is left open, matching the reference layout).
  for (let i = 0; i < columnCount; i++) {
    result.push(decoration({
      x: ROW_HEADER_WIDTH + i * COLUMN_WIDTH,
      y: -COLUMN_HEADER_HEIGHT,
      width: 0,
      height: COLUMN_HEADER_HEIGHT + gridBottom,
      kind: "line",
    }));
  }

  // Horizontal grid lines between rows only (not above the first row or below
  // the last - same reasoning as headingBullets' separators).
  let rowBoundaryY = 0;
  rows.forEach(({ height }, rowIndex) => {
    rowBoundaryY += height;
    if (rowIndex < rows.length - 1) {
      result.push(decoration({
        x: ROW_HEADER_WIDTH,
        y: rowBoundaryY,
        width: gridWidth,
        height: 0,
        kind: "line",
      }));
    }
  });

  return result;
}

// Column headers live in params, not the outline text itself (doc/spec.md
// §6.2.4, same reasoning as matrix.ts's axis labels).
export function bulletMatrixColumnHeaders(params: RawParams): string[] {
  return stringListParam(params, "columnHeaders");
}

export const bulletMatrixPattern: PatternDefinition = {
  layout: (outline, params) => layoutBulletMatrix(outline, bulletMatrixColumnHeaders(params)),
  // Column headers are placed above row 0.
  normalizeOrigin: true,
  restructure: "relayout",
  // A row needs one empty cell per column up front - otherwise it would
  // render with a heading and zero cells, and the generic outline editor has
  // no way to know it should add exactly columnHeaders.length children.
  newRoot: (params) => emptyNode(emptyNodes(bulletMatrixColumnHeaders(params).length)),
};
