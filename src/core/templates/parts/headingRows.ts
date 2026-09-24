import type { OutlineNode } from "../../model/document";
import { decoration, textNode } from "../layoutNode";
import type { LayoutNode, LayoutNodeProps } from "../layoutNode";

// Trimmed off the bottom of each heading cell so adjacent rows' identically
// colored heading blocks don't visually fuse into one solid band - a sliver
// of the canvas background shows through between them instead, making each
// row's boundary readable.
const HEADING_GAP = 4;

export interface HeadingRowsOptions {
  // y of the first row's top edge (below any title).
  top: number;
  headingWidth: number;
  // Width of the dashed rule between two rows, starting at the heading
  // column's right edge. The heading column is one continuous band of
  // identical color across every row, so a seam there wouldn't show.
  separatorWidth: number;
  minRowHeight: number;
  paddingY: number;
  // Height of a row's content, before paddingY is added above and below.
  contentHeight: (row: OutlineNode, index: number) => number;
  // A row's content nodes, given the row's final top edge and height.
  content: (row: OutlineNode, index: number, rowTop: number, rowHeight: number) => LayoutNode[];
  // Extra props for a row's heading cell (fontSize, bulletMarker, ...).
  heading?: (row: OutlineNode, index: number) => Partial<LayoutNodeProps>;
}

// Row-by-row table with a filled heading cell on the left and free-form
// content on the right, rows separated by dashed rules - headingBullets
// (doc/spec.md §6.2.3) and the patterns derived from it. Each root outline
// node is one row whose own text is the heading; the heading cell is a single
// shape that's both its own background and its own label (kind: "heading") -
// a separate background shape sharing the row's nodeId would confuse
// relayoutBlock's per-nodeId shape matching in sync.ts. A row's height follows its own content, so every row below shifts when one
// grows - these patterns always fully regenerate (isFullyRelayoutedPattern in
// sync.ts).
export function headingRows(rows: OutlineNode[], options: HeadingRowsOptions): LayoutNode[] {
  const result: LayoutNode[] = [];
  let y = options.top;

  rows.forEach((row, i) => {
    const rowHeight = Math.max(options.minRowHeight, options.contentHeight(row, i) + options.paddingY * 2);

    result.push(
      textNode(row, 0, {
        x: 0,
        y,
        width: options.headingWidth,
        height: rowHeight - HEADING_GAP,
        kind: "heading",
        ...options.heading?.(row, i),
      }),
    );
    result.push(...options.content(row, i, y, rowHeight));

    y += rowHeight;

    // Between this row and the next - not above the first or below the last.
    if (i < rows.length - 1) {
      result.push(decoration({ x: options.headingWidth, y, width: options.separatorWidth, height: 0, kind: "line" }));
    }
  });

  return result;
}
