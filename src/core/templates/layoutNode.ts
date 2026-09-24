import type { OutlineNode } from "../model/document";
import type { Point } from "../model/shape";
import type { ThemeColorSlot } from "../model/style";

// How a shape is painted. Each value means the same thing on every kind that
// accepts it, so a pattern states the look it wants rather than toggling
// kind-specific flags (see styleFor in sync.ts, which maps these onto
// style.ts's functions).
export type Paint =
  // Solid theme color, border in the same color (horizontalFlow's step
  // circles, beforeAfter's TOBE panel, pyramidChart's bands; for a "heading",
  // the cell's own background).
  | { fill: ThemeColorSlot }
  // Unfilled, stroked in a theme color - an outline for a closed shape
  // (venn's circles, matrix's quadrant boxes, chevronFlow's open-sided
  // outlines), the line itself for a "line" (row separators, rules).
  | { stroke: ThemeColorSlot; dashed?: boolean }
  // A fixed, theme-independent light gray fill (style.ts's
  // neutralPanelStyle) - structure or a deliberately unbranded state that
  // must not take the theme's color: beforeAfter's ASIS panel,
  // beforeAfterHorizontal's connector arrows, gridMatrix's tiles.
  | "neutral"
  // A "line" drawn as a thick, fixed-gray axis (style.ts's
  // timelineTrackStyle) - timeline's single vertical track.
  | "track";

// The primitive every pattern layout produces: one generated shape's
// geometry, styling hints and outline binding, before sync.ts turns it into
// an actual Shape (see regenerateBlockShapes/styleFor there).
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
  // What gets generated:
  // - "text" (default): a labeled box in the theme's default bordered style
  // - "label": borderless text drawn on top of another shape rather than its
  //   own layer (venn's set names, bullet items, a cell's title/detail lines)
  // - "heading": a text cell that is its own solid-filled background
  //   (headingBullets' row heading, bulletMatrix's row/column headers)
  // - "ellipse"/"rect"/"polygon": an unlabeled closed shape; any label is a
  //   separate "label" drawn on top
  // - "line": a plain line from (x, y) to (x + width, y + height)
  kind?: "text" | "ellipse" | "rect" | "label" | "heading" | "line" | "polygon";

  // How the shape is painted, for every kind except "text"/"label" (whose
  // look is fixed). Defaults when omitted: an outline in primary[0] for
  // "ellipse"/"rect", a primary[0] fill for "polygon"/"heading", and a dashed
  // primary[2] separator for "line".
  paint?: Paint;

  // --- Text styling, for the text-bearing kinds ("text"/"label"/"heading") ---

  // Horizontal text alignment; defaults to "center" (see
  // regenerateBlockShapes in sync.ts). Bullet items use "left", matching
  // normal bulleted-list reading order.
  align?: "left" | "center" | "right";
  // Overrides the kind's own default font size - e.g. Venn's set name wants a
  // larger, title-like size than a regular "label".
  fontSize?: number;
  // The below three override individual aspects of the kind's own default
  // style - e.g. bulletMatrix's title line wants "label"'s usual borderless
  // text, just bolder and underlined.
  fontWeight?: "normal" | "bold";
  italic?: boolean;
  underline?: boolean;
  // Overrides the kind's own default text color with theme.primary[slot] (or
  // theme.accent) - e.g. bulletMatrix's detail line wants a lighter shade
  // than its title line, for visual hierarchy within a cell.
  textColorSlot?: ThemeColorSlot;
  // Overrides the kind's own default text color by contrast against the
  // theme color at this slot, instead of a fixed color (see style.ts's
  // contrastTextColor) - for text on top of a fill that varies enough that
  // neither a fixed dark nor a fixed light text color stays legible
  // everywhere. pyramidChart's item-name/scale labels pass their own band's
  // fill slot, since the bands go from a dark shade at the apex to a light
  // one at the base. Takes priority over `textColorSlot` when both are set.
  contrastBgColorSlot?: ThemeColorSlot;
  // Renders this literal prefix (e.g. "• ", "- ") ahead of the text without
  // it being part of the shape's editable content (see shape.ts's
  // TextShape.bulletMarker for why).
  bulletMarker?: string;

  // --- Kind-specific geometry ---

  // "polygon": vertices as fractions (0..1) of this node's own width/height,
  // forwarded verbatim to PolygonShape.points (see parts/polygon.ts).
  points?: Point[];
  // "line": generates a directional ConnectorShape (`type: "arrow"`,
  // marker-tipped - see ConnectorRenderer.tsx) instead of a plain undirected
  // LineShape - schedule.ts's dependency arrows, the flow patterns' step
  // arrows.
  arrowhead?: boolean;
  // "rect": rounded corner radius, forwarded verbatim to
  // RectShape.cornerRadius (see shape.ts).
  cornerRadius?: number;
  // Rotation in degrees around the node's own center, forwarded verbatim to
  // ShapeBase.rotation - gridMatrix's vertical axis name (doc/spec.md
  // §6.2.16), since text shapes have no vertical writing mode.
  rotation?: number;
}

// Every LayoutNode field except its outline binding (nodeIds/text/depth) -
// what the factories below take, so a pattern only spells out geometry and
// styling.
export type LayoutNodeProps = Omit<LayoutNode, "nodeIds" | "text" | "depth">;

// A node bound to one outline node and showing its text - the usual case for
// a pattern's content. A missing node (e.g. an optional child[0] not yet
// filled in) yields an untracked, empty node instead, so callers don't need
// their own `node ? [node.id] : []` / `node?.text ?? ""` fallbacks.
export function textNode(node: OutlineNode | undefined, depth: number, props: LayoutNodeProps): LayoutNode {
  return { nodeIds: node ? [node.id] : [], text: node?.text ?? "", depth, ...props };
}

// A node bound to one outline node but carrying no text of its own - the
// shape behind that node's label (a card, a dot, a quadrant box), so a click
// on either selects the same outline node.
export function shapeNode(node: OutlineNode | undefined, props: LayoutNodeProps): LayoutNode {
  return { nodeIds: node ? [node.id] : [], text: "", depth: 0, ...props };
}

// Fixed or derived text not tied to any outline node (a title from params, a
// column header, an auto-generated step number) - untracked, so it's always
// regenerated with the rest of the block rather than edited in place.
export function fixedText(text: string, props: LayoutNodeProps): LayoutNode {
  return { nodeIds: [], text, depth: 0, ...props };
}

// Pure structure not tied to any outline node (grid lines, separators,
// connector arrows, background panels) - untracked, like fixedText.
export function decoration(props: LayoutNodeProps): LayoutNode {
  return { nodeIds: [], text: "", depth: 0, ...props };
}

// A node's paint with the per-kind default applied (see LayoutNode.paint);
// undefined for "text"/"label", whose look isn't paint-driven.
export function paintOf(node: LayoutNode): Paint | undefined {
  if (node.paint !== undefined) return node.paint;
  switch (node.kind) {
    case "ellipse":
    case "rect":
      return { stroke: 0 };
    case "polygon":
    case "heading":
      return { fill: 0 };
    case "line":
      return { stroke: 2, dashed: true };
    default:
      return undefined;
  }
}

// The theme slot a node is filled with, if it's painted with a theme fill.
export function fillSlotOf(node: LayoutNode): ThemeColorSlot | undefined {
  const paint = paintOf(node);
  return typeof paint === "object" && "fill" in paint ? paint.fill : undefined;
}

// The theme slot a node is stroked with, if it's painted as a theme outline
// or line.
export function strokeSlotOf(node: LayoutNode): ThemeColorSlot | undefined {
  const paint = paintOf(node);
  return typeof paint === "object" && "stroke" in paint ? paint.stroke : undefined;
}

export function isDashed(node: LayoutNode): boolean {
  const paint = paintOf(node);
  return typeof paint === "object" && "stroke" in paint && paint.dashed === true;
}
