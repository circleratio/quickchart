import type { OutlineNode } from "../../model/document";
import { textNode } from "../layoutNode";
import type { LayoutNode, LayoutNodeProps } from "../layoutNode";

export interface LineStackOptions {
  x: number;
  y: number;
  width: number;
  lineHeight: number;
  // Space between two consecutive lines (not above the first/below the last).
  gap?: number;
  // Outline depth of each line - a number for a uniform list, or per index
  // when the first line plays a different role (e.g. a group's own text
  // followed by its children).
  depth: number | ((index: number) => number);
  // Styling shared by every line (kind, align, fontSize, bulletMarker, ...).
  props: Omit<LayoutNodeProps, "x" | "y" | "width" | "height">;
}

// Total height of `count` stacked lines - 0 for an empty stack.
export function lineStackHeight(count: number, lineHeight: number, gap = 0): number {
  return count > 0 ? count * (lineHeight + gap) - gap : 0;
}

// One label per outline node, stacked top-down at a fixed pitch - the bullet
// lists and description lines most patterns place inside a row or card.
export function lineStack(items: OutlineNode[], options: LineStackOptions): LayoutNode[] {
  const gap = options.gap ?? 0;
  const { depth } = options;
  return items.map((item, i) =>
    textNode(item, typeof depth === "number" ? depth : depth(i), {
      ...options.props,
      x: options.x,
      y: options.y + i * (options.lineHeight + gap),
      width: options.width,
      height: options.lineHeight,
    }),
  );
}
