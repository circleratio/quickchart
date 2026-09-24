import type { OutlineNode } from "../model/document";
import { decoration, textNode } from "./layoutNode";
import type { LayoutNode } from "./layoutNode";

const HEADING_WIDTH = 220;
const CONTENT_WIDTH = 700;
const ITEM_HEIGHT = 28;
const ITEM_GAP = 4;
const ROW_PADDING_Y = 18;
const ROW_MIN_HEIGHT = 64;
const BULLET_INDENT = 24;
const CONTENT_RIGHT_PADDING = 20;
// Trimmed off the bottom of each heading cell so adjacent rows' heading
// blocks don't visually fuse into one solid band - a sliver of the canvas
// background shows through between them instead, making each row's block
// boundary readable even though every heading uses the same fill color.
const HEADING_GAP = 4;

export const HEADING_BULLETS_TABLE_WIDTH = HEADING_WIDTH + CONTENT_WIDTH;

// Row-by-row "heading + bullet list" table (doc/spec.md §6.2.3): each root
// outline node is a row's heading (filled, on the left), and its children are
// that row's bullet points (borderless, stacked on the right, "• "-prefixed).
// A row's height is driven entirely by its own bullet count, so - like
// matrix/venn - every edit re-lays out every row from scratch (see
// isFullyRelayoutedPattern in sync.ts): adding/removing a bullet in one row
// shifts every row below it.
export function layoutHeadingBullets(outline: OutlineNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  let y = 0;

  outline.forEach((row, rowIndex) => {
    const itemsHeight = row.children.length * (ITEM_HEIGHT + ITEM_GAP) - ITEM_GAP;
    const rowHeight = Math.max(ROW_MIN_HEIGHT, itemsHeight + ROW_PADDING_Y * 2);

    // The heading cell is a single shape that's both its own background and
    // its own label (kind: "heading") - unlike matrix's quadrant, there's no
    // separate "item area" below a title to leave unfilled, so a second
    // background-only shape would just be redundant (and, since it'd share
    // this row's nodeId with the label shape, would confuse relayoutBlock's
    // per-nodeId shape matching in sync.ts - see matrix.ts's own two-shape
    // quadrant for the shape this avoids).
    result.push(textNode(row, 0, {
      x: 0,
      y,
      width: HEADING_WIDTH,
      height: rowHeight - HEADING_GAP,
      kind: "heading",
    }));

    row.children.forEach((item, itemIndex) => {
      result.push(textNode(item, 1, {
        x: HEADING_WIDTH + BULLET_INDENT,
        y: y + ROW_PADDING_Y + itemIndex * (ITEM_HEIGHT + ITEM_GAP),
        width: CONTENT_WIDTH - BULLET_INDENT - CONTENT_RIGHT_PADDING,
        height: ITEM_HEIGHT,
        kind: "label",
        align: "left",
        bulletMarker: "• ",
      }));
    });

    y += rowHeight;

    // A dashed rule between this row and the next - not above the first row
    // or below the last (see the loop condition). Spans only the content
    // column: the heading column is one continuous band of identical color
    // across every row, so a seam there wouldn't be visible anyway.
    if (rowIndex < outline.length - 1) {
      result.push(decoration({
        x: HEADING_WIDTH,
        y,
        width: CONTENT_WIDTH,
        height: 0,
        kind: "line",
      }));
    }
  });

  return result;
}
