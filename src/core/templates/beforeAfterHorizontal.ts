import type { OutlineNode } from "../model/document";
import type { Point } from "../model/shape";
import { decoration, fixedText, textNode } from "./layoutNode";
import type { LayoutNode } from "./layoutNode";

const ROW_HEADER_WIDTH = 220;
const COLUMN_WIDTH = 620;
// Gap between the two content columns, wide enough to hold the connector
// arrow centered within it - same idea as flowScheduleHorizontal's
// CONNECTOR_WIDTH.
const ARROW_COLUMN_WIDTH = 90;
const ARROW_SIZE = 40;

const COLUMN_HEADER_HEIGHT = 36;
const COLUMN_HEADER_FONT_SIZE = 16;

const ITEM_HEIGHT = 28;
const ITEM_GAP = 6;
const ROW_PADDING_Y = 18;
const ROW_MIN_HEIGHT = 64;
const CONTENT_PADDING_X = 20;
const CONTENT_RIGHT_PADDING = 20;
// Trimmed off the bottom of each row heading cell so adjacent rows' row
// headings don't visually fuse into one solid band - same reasoning as
// headingBullets' HEADING_GAP (see headingBullets.ts).
const HEADING_GAP = 4;

const TOTAL_WIDTH = ROW_HEADER_WIDTH + COLUMN_WIDTH * 2 + ARROW_COLUMN_WIDTH;

// Right-pointing triangle, as vertex fractions of its own bounding box (see
// shape.ts's PolygonShape) - same shape as flowScheduleHorizontal's connector.
const RIGHT_TRIANGLE_POINTS: Point[] = [
  { x: 0, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 0.5 },
];

// A "before"/"after" group's bullet lines: its OWN text is the first line,
// its children are the rest (see the doc comment below for why) - same
// "root text + children" stacking as horizontalFlow's label lines
// (doc/spec.md §6.2.8) or beforeAfter's TOBE block (§6.2.12), just bulleted.
function groupItems(group: OutlineNode | undefined): OutlineNode[] {
  return group ? [group, ...group.children] : [];
}

// "ビフォーアフター（横）" (doc/spec.md §6.2.13): headingBullets (§6.2.3)
// widened to two bulleted content columns per row - a "before" column (e.g.
// "考慮すべき機会") and an "after" column (e.g. "展開戦略") connected by a
// gray arrow, under a pair of shared, underlined column headers. Root
// outline nodes (depth 0) are rows in order, and a root's own text is the
// row heading (filled, on the left, like headingBullets). child[0]/child[1]
// (position-based, like pyramidChart's scale/cells) are the "before"/"after"
// groups - UNLIKE bulletMatrix's cells (whose own text is unused), a
// group's own text is its first bullet line and its children are the rest
// (groupItems above), so every input row - including the group node itself -
// has a real, editable destination (see beforeAfter.ts's own doc comment for
// the earlier version of this mistake: a position-based node whose own text
// dead-ends is confusing, not just wasteful).
export function layoutBeforeAfterHorizontal(outline: OutlineNode[], beforeLabel: string, afterLabel: string): LayoutNode[] {
  const result: LayoutNode[] = [];

  const beforeX = ROW_HEADER_WIDTH;
  const afterX = ROW_HEADER_WIDTH + COLUMN_WIDTH + ARROW_COLUMN_WIDTH;

  // Column headers sit above row 0 (negative y, like bulletMatrix's/
  // pyramidChart's own column headers - see normalizeToOrigin in sync.ts,
  // which this pattern is registered with), each with its own solid
  // underline spanning just that column's width (not a single combined
  // rule, matching the reference image's two separate underlines).
  result.push(fixedText(beforeLabel, {
    x: beforeX,
    y: -COLUMN_HEADER_HEIGHT,
    width: COLUMN_WIDTH,
    height: COLUMN_HEADER_HEIGHT,
    kind: "label",
    align: "center",
    fontWeight: "bold",
    fontSize: COLUMN_HEADER_FONT_SIZE,
  }));
  result.push(decoration({ x: beforeX, y: 0, width: COLUMN_WIDTH, height: 0, kind: "line", dashed: false }));

  result.push(fixedText(afterLabel, {
    x: afterX,
    y: -COLUMN_HEADER_HEIGHT,
    width: COLUMN_WIDTH,
    height: COLUMN_HEADER_HEIGHT,
    kind: "label",
    align: "center",
    fontWeight: "bold",
    fontSize: COLUMN_HEADER_FONT_SIZE,
  }));
  result.push(decoration({ x: afterX, y: 0, width: COLUMN_WIDTH, height: 0, kind: "line", dashed: false }));

  let y = 0;
  outline.forEach((row, rowIndex) => {
    const beforeItems = groupItems(row.children[0]);
    const afterItems = groupItems(row.children[1]);
    const itemCount = Math.max(beforeItems.length, afterItems.length);
    const itemsHeight = itemCount > 0 ? itemCount * (ITEM_HEIGHT + ITEM_GAP) - ITEM_GAP : 0;
    const rowHeight = Math.max(ROW_MIN_HEIGHT, itemsHeight + ROW_PADDING_Y * 2);

    // The row heading cell - a single shape that's both its own background
    // and its own label (kind: "heading"), same reasoning as headingBullets'
    // own row heading (see headingBullets.ts).
    result.push(textNode(row, 0, {
      x: 0,
      y,
      width: ROW_HEADER_WIDTH,
      height: rowHeight - HEADING_GAP,
      kind: "heading",
    }));

    beforeItems.forEach((item, i) => {
      result.push(textNode(item, i === 0 ? 1 : 2, {
        x: beforeX + CONTENT_PADDING_X,
        y: y + ROW_PADDING_Y + i * (ITEM_HEIGHT + ITEM_GAP),
        width: COLUMN_WIDTH - CONTENT_PADDING_X - CONTENT_RIGHT_PADDING,
        height: ITEM_HEIGHT,
        kind: "label",
        align: "left",
        bulletMarker: "• ",
      }));
    });

    afterItems.forEach((item, i) => {
      result.push(textNode(item, i === 0 ? 1 : 2, {
        x: afterX + CONTENT_PADDING_X,
        y: y + ROW_PADDING_Y + i * (ITEM_HEIGHT + ITEM_GAP),
        width: COLUMN_WIDTH - CONTENT_PADDING_X - CONTENT_RIGHT_PADDING,
        height: ITEM_HEIGHT,
        kind: "label",
        align: "left",
        bulletMarker: "• ",
      }));
    });

    // The connector arrow, centered in the gap between the two columns and
    // vertically centered on this row - a fixed neutral gray (`neutralFill`,
    // see layoutNode.ts/style.ts), not this document's color theme, since
    // it's structural, not branded content (same reasoning as timeline's
    // track line).
    result.push(decoration({
      x: ROW_HEADER_WIDTH + COLUMN_WIDTH + (ARROW_COLUMN_WIDTH - ARROW_SIZE) / 2,
      y: y + rowHeight / 2 - ARROW_SIZE / 2,
      width: ARROW_SIZE,
      height: ARROW_SIZE,
      kind: "polygon",
      points: RIGHT_TRIANGLE_POINTS,
      neutralFill: true,
    }));

    y += rowHeight;

    // A dashed rule between this row and the next - not above the first row
    // or below the last (see the loop condition) - same reasoning as
    // headingBullets' separator. Spans both content columns and the arrow
    // gap between them (the row heading column is one continuous band of
    // identical color across every row, so a seam there wouldn't show).
    if (rowIndex < outline.length - 1) {
      result.push(decoration({
        x: ROW_HEADER_WIDTH,
        y,
        width: TOTAL_WIDTH - ROW_HEADER_WIDTH,
        height: 0,
        kind: "line",
      }));
    }
  });

  return result;
}
