import type { OutlineNode } from "../model/document";
import type { Point } from "../model/shape";
import type { ThemeColorSlot } from "../model/style";

export interface LayoutNode {
  // Usually one outline node id; more than one when several nodes share a
  // single generated shape (Venn's overlap regions - see doc/spec.md §6.2.2).
  nodeIds: string[];
  text: string;
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  // "text" (default) generates a labeled box; "ellipse"/"rect" generate a
  // plain outline with no label (Venn's set circles - see venn.ts; a matrix
  // quadrant's background square - see matrix.ts); "label" generates
  // borderless text drawn on top of another shape rather than its own layer
  // (Venn's set names; headingBullets' bullet items; bulletMatrix's title/
  // detail lines within a cell); "heading" generates a solid-filled,
  // borderless text cell that is its own background (headingBullets' row
  // heading; bulletMatrix's row/column headers); "line" generates a plain
  // (typically dashed) line, not a labeled shape (headingBullets' row
  // separators; bulletMatrix's row/column grid lines); "polygon" generates a
  // solid-filled, unlabeled closed shape (pyramidChart's pyramid-slice bands -
  // see pyramidChart.ts), using the `points` field below.
  kind?: "text" | "ellipse" | "rect" | "label" | "heading" | "line" | "polygon";
  // Horizontal text alignment for a text-bearing kind ("text"/"label"/
  // "heading"); defaults to "center" when omitted (see regenerateBlockShapes
  // in sync.ts). headingBullets'/bulletMatrix's bullet items use "left",
  // matching normal bulleted-list reading order.
  align?: "left" | "center" | "right";
  // Overrides the kind's own default font size (see regenerateBlockShapes in
  // sync.ts) - e.g. Venn's set name wants a larger, title-like size than a
  // regular "label".
  fontSize?: number;
  // The below three override individual aspects of the kind's own default
  // style (see styleFor in sync.ts) - e.g. bulletMatrix's title line wants
  // "label"'s usual borderless text, just bolder and underlined.
  fontWeight?: "normal" | "bold";
  italic?: boolean;
  underline?: boolean;
  // Overrides the kind's own default text color with theme.primary[slot] (or
  // theme.accent) - e.g. bulletMatrix's detail line wants a lighter shade
  // than its title line, for visual hierarchy within a cell.
  textColorSlot?: ThemeColorSlot;
  // Overrides the kind's own default text color by contrast against the
  // theme color at this slot, instead of a fixed color (see style.ts's
  // contrastTextColor) - for a label drawn on top of a shape whose own fill
  // varies enough that neither a fixed dark nor a fixed light text color
  // stays legible everywhere. pyramidChart's item-name/scale labels set this
  // to their own band's fillColorSlot (pyramidChart.ts), since the band goes
  // from a dark shade at the apex to a light one at the base. Takes priority
  // over `textColorSlot` when both are set.
  contrastBgColorSlot?: ThemeColorSlot;
  // For a "heading" kind: which theme color to fill the cell with (see
  // headingStyle in style.ts). Defaults to primary[0] (headingBullets' navy);
  // bulletMatrix's row/column headers pass a different slot so all three
  // kinds of heading (this pattern's two, plus headingBullets') read as
  // visually distinct roles.
  fillColorSlot?: ThemeColorSlot;
  // Set on a "label" kind to render this literal prefix (e.g. "• ", "- ")
  // ahead of the text without it being part of the shape's editable content
  // (see shape.ts's TextShape.bulletMarker for why).
  bulletMarker?: string;
  // For a "polygon" kind: vertices as fractions (0..1) of this LayoutNode's
  // own width/height, forwarded verbatim to PolygonShape.points (see
  // shape.ts) - see pyramidChart.ts for how the pyramid taper is computed.
  points?: Point[];
  // For a "line" kind: false renders a solid rule (see style.ts's ruleStyle -
  // pyramidChart's title/header divider) instead of the default dashed
  // separator (style.ts's separatorStyle, used by headingBullets/bulletMatrix
  // and by pyramidChart's own row separators). Undefined behaves as true.
  dashed?: boolean;
}

export interface TreeLayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  depthGap: number;
  siblingGap: number;
  // "down" = roots at top, children below (pyramid); "right" = roots at left,
  // children extend rightward (logic tree). See doc/spec.md §6.2.
  direction: "down" | "right";
}

// Simple leaf-count-based tree layout: each leaf gets one "slot" along the
// spread axis, and each parent is centered over the span of its children.
export function layoutTree(outline: OutlineNode[], options: TreeLayoutOptions): LayoutNode[] {
  const { nodeWidth, nodeHeight, depthGap, siblingGap, direction } = options;
  const spreadSize = direction === "down" ? nodeWidth : nodeHeight;
  const depthStep = (direction === "down" ? nodeHeight : nodeWidth) + depthGap;
  const result: LayoutNode[] = [];
  let cursor = 0;

  function place(node: OutlineNode, depth: number): number {
    const depthPos = depth * depthStep;
    let spreadPos: number;

    if (node.children.length === 0) {
      spreadPos = cursor;
      cursor += spreadSize + siblingGap;
    } else {
      const centers = node.children.map((child) => place(child, depth + 1));
      spreadPos = (centers[0] + centers[centers.length - 1]) / 2 - spreadSize / 2;
    }

    result.push({
      nodeIds: [node.id],
      text: node.text,
      depth,
      x: direction === "down" ? spreadPos : depthPos,
      y: direction === "down" ? depthPos : spreadPos,
      width: nodeWidth,
      height: nodeHeight,
    });
    return spreadPos + spreadSize / 2;
  }

  for (const root of outline) place(root, 0);
  return result;
}
