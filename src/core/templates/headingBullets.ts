import type { OutlineNode } from "../model/document";
import type { LayoutNode } from "./layoutNode";
import { headingRows } from "./parts/headingRows";
import { lineStack, lineStackHeight } from "./parts/lineStack";
import type { PatternDefinition } from "./patternDefinition";

const HEADING_WIDTH = 220;
const CONTENT_WIDTH = 700;
const ITEM_HEIGHT = 28;
const ITEM_GAP = 4;
const ROW_PADDING_Y = 18;
const ROW_MIN_HEIGHT = 64;
const BULLET_INDENT = 24;
const CONTENT_RIGHT_PADDING = 20;

export const HEADING_BULLETS_TABLE_WIDTH = HEADING_WIDTH + CONTENT_WIDTH;

// Row-by-row "heading + bullet list" table (doc/spec.md §6.2.3): each root
// outline node is a row's heading (filled, on the left), and its children are
// that row's bullet points (borderless, stacked on the right, "• "-prefixed).
// A row's height is driven entirely by its own bullet count, so - like
// matrix/venn - every edit re-lays out every row from scratch (see
// isFullyRelayoutedPattern in sync.ts): adding/removing a bullet in one row
// shifts every row below it.
export function layoutHeadingBullets(outline: OutlineNode[]): LayoutNode[] {
  return headingRows(outline, {
    top: 0,
    headingWidth: HEADING_WIDTH,
    separatorWidth: CONTENT_WIDTH,
    minRowHeight: ROW_MIN_HEIGHT,
    paddingY: ROW_PADDING_Y,
    contentHeight: (row) => lineStackHeight(row.children.length, ITEM_HEIGHT, ITEM_GAP),
    content: (row, _i, rowTop) =>
      lineStack(row.children, {
        x: HEADING_WIDTH + BULLET_INDENT,
        y: rowTop + ROW_PADDING_Y,
        width: CONTENT_WIDTH - BULLET_INDENT - CONTENT_RIGHT_PADDING,
        lineHeight: ITEM_HEIGHT,
        gap: ITEM_GAP,
        depth: 1,
        props: { kind: "label", align: "left", bulletMarker: "• " },
      }),
  });
}

export const headingBulletsPattern: PatternDefinition = {
  label: "見出し付き箇条書き",
  layout: (outline) => layoutHeadingBullets(outline),
};
