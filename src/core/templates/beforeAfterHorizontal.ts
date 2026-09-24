import type { OutlineNode } from "../model/document";
import { decoration, fixedText } from "./layoutNode";
import type { LayoutNode } from "./layoutNode";
import { headingRows } from "./parts/headingRows";
import { lineStack, lineStackHeight } from "./parts/lineStack";
import { RIGHT_TRIANGLE_POINTS } from "./parts/polygon";
import { emptyNode, emptyNodes, stringParam } from "./patternDefinition";
import type { PatternDefinition } from "./patternDefinition";

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

const TOTAL_WIDTH = ROW_HEADER_WIDTH + COLUMN_WIDTH * 2 + ARROW_COLUMN_WIDTH;

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

  // A group's own text is its first bullet line (depth 1), its children the
  // rest (depth 2).
  const groupColumn = (items: OutlineNode[], columnX: number, rowTop: number) =>
    lineStack(items, {
      x: columnX + CONTENT_PADDING_X,
      y: rowTop + ROW_PADDING_Y,
      width: COLUMN_WIDTH - CONTENT_PADDING_X - CONTENT_RIGHT_PADDING,
      lineHeight: ITEM_HEIGHT,
      gap: ITEM_GAP,
      depth: (i) => (i === 0 ? 1 : 2),
      props: { kind: "label", align: "left", bulletMarker: "• " },
    });

  // Rows separated by a dashed rule spanning both content columns and the
  // arrow gap between them.
  result.push(
    ...headingRows(outline, {
      top: 0,
      headingWidth: ROW_HEADER_WIDTH,
      separatorWidth: TOTAL_WIDTH - ROW_HEADER_WIDTH,
      minRowHeight: ROW_MIN_HEIGHT,
      paddingY: ROW_PADDING_Y,
      contentHeight: (row) =>
        lineStackHeight(Math.max(groupItems(row.children[0]).length, groupItems(row.children[1]).length), ITEM_HEIGHT, ITEM_GAP),
      content: (row, _i, rowTop, rowHeight) => [
        ...groupColumn(groupItems(row.children[0]), beforeX, rowTop),
        ...groupColumn(groupItems(row.children[1]), afterX, rowTop),
        // The connector arrow, centered in the gap between the two columns
        // and vertically centered on this row - a fixed neutral gray
        // (`neutralFill`, see layoutNode.ts/style.ts), not this document's
        // color theme, since it's structural, not branded content (same
        // reasoning as timeline's track line).
        decoration({
          x: ROW_HEADER_WIDTH + COLUMN_WIDTH + (ARROW_COLUMN_WIDTH - ARROW_SIZE) / 2,
          y: rowTop + rowHeight / 2 - ARROW_SIZE / 2,
          width: ARROW_SIZE,
          height: ARROW_SIZE,
          kind: "polygon",
          points: RIGHT_TRIANGLE_POINTS,
          neutralFill: true,
        }),
      ],
    }),
  );

  return result;
}

export const beforeAfterHorizontalPattern: PatternDefinition = {
  label: "ビフォーアフター（横）",
  layout: (outline, params) =>
    layoutBeforeAfterHorizontal(outline, stringParam(params, "beforeLabel"), stringParam(params, "afterLabel")),
  // Column headers are placed above row 0.
  normalizeOrigin: true,
  // A row starts with both its "before" and "after" groups (child[0]/[1]).
  newRoot: () => emptyNode(emptyNodes(2)),
  paramEditors: [
    {
      kind: "fields",
      heading: "列見出し",
      fields: [
        { key: "beforeLabel", label: "Before" },
        { key: "afterLabel", label: "After" },
      ],
    },
  ],
  // The "before"/"after" groups (child[0]/[1]) are locked at both
  // positions; their own text is the group's first bullet and their
  // children the rest.
  nodeRule: ({ depth, index }) =>
    depth === 1
      ? { fixed: true, noIndent: true, noAddSibling: true, placeholder: index === 0 ? "Before項目(1件目)" : "After項目(1件目)" }
      : {},
};
