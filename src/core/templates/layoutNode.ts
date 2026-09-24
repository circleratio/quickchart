import type { OutlineNode } from "../model/document";
import type { Point } from "../model/shape";
import type { ThemeColorSlot } from "../model/style";

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
  // "text" (default) generates a labeled box; "ellipse"/"rect" generate an
  // unlabeled shape - by default a plain outline (Venn's set circles - see
  // venn.ts; a matrix quadrant's background square - see matrix.ts), or a
  // solid fill when `fillColorSlot` is set (horizontalFlow's step circles -
  // see horizontalFlow.ts; unlike "heading" below, there's no text on the
  // shape itself, since it has none of its own - any label is a separate
  // "label"-kind shape drawn on top); "label" generates
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
  // visually distinct roles. For an "ellipse"/"rect" kind: set to fill the
  // shape solidly (style.ts's filledShapeStyle) instead of the default
  // unfilled outline - undefined keeps it unfilled (horizontalFlow's first,
  // "casual/optional" step circle - see horizontalFlow.ts).
  fillColorSlot?: ThemeColorSlot;
  // For an "ellipse"/"rect" kind with no `fillColorSlot`: fills with
  // `style.ts`'s `neutralPanelStyle` (a fixed, theme-independent light gray)
  // instead of leaving it unfilled - beforeAfter's "ASIS" cell background
  // (doc/spec.md §6.2.12), which is deliberately NOT theme-colored (see
  // neutralPanelStyle's own doc comment). Ignored when `fillColorSlot` is
  // set. Undefined/false behaves as the normal unfilled outline. For a
  // "polygon" kind (which otherwise always uses `fillColorSlot`'s themed
  // fill, defaulting to primary[0] - see headingStyle): true fills with
  // `neutralPanelStyle` instead - beforeAfterHorizontal's connector arrow
  // (doc/spec.md §6.2.13), a structural connector like a tree's connector
  // line rather than themed content, so it stays neutral regardless of the
  // active theme (same reasoning as timelineTrackStyle).
  neutralFill?: boolean;
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
  // For an "ellipse"/"rect" kind, the opposite default applies: true dashes
  // the (otherwise solid) outline/border - horizontalFlow's first step
  // circle, undefined/false behaves as a plain solid border.
  dashed?: boolean;
  // For a "line" kind: true generates a directional ConnectorShape
  // (`type: "arrow"`, marker-tipped - see ConnectorRenderer.tsx) from (x, y)
  // to (x + width, y + height) instead of a plain undirected LineShape -
  // schedule.ts's simplified dependency arrows (doc/spec.md §6.2.6).
  // Undefined/false behaves as a plain line.
  arrowhead?: boolean;
  // For a "rect" kind: rounded corner radius, forwarded verbatim to
  // RectShape.cornerRadius (see shape.ts) - flowScheduleHorizontal's step
  // cards (doc/spec.md §6.2.10), the first template shape to use this (every
  // other "rect" so far, e.g. matrix's quadrant background, is
  // square-cornered). Undefined/0 behaves as a plain square corner.
  cornerRadius?: number;
  // For a "line" kind: renders with `style.ts`'s `timelineTrackStyle` (a
  // fixed, theme-independent gray, thicker than the usual theme-colored
  // dashed/solid rule) instead of the usual dashed/solid styling - timeline's
  // single vertical axis line (doc/spec.md §6.2.11), which reads as neutral
  // structure like a tree connector rather than themed chart content.
  // Undefined/false behaves as a normal "line".
  trackStyle?: boolean;
  // For a "polygon" kind: renders it unfilled, stroked in theme.primary[slot]
  // (style.ts's strokeOnlyStyle), instead of the usual solid themed fill -
  // chevronFlow's chevron and body-box outlines (doc/spec.md §6.2.14), which
  // retrace their own path so one side stays open (see chevronFlow.ts).
  // Takes priority over `fillColorSlot`/`neutralFill`. For an "ellipse"/
  // "rect" kind with no `fillColorSlot`: the same unfilled outline, in this
  // shade instead of outlineStyle's fixed primary[0] - matrix's quadrant
  // boxes and outlined badge (doc/spec.md §6.2.1).
  strokeColorSlot?: ThemeColorSlot;
  // Rotation in degrees around the node's own center, forwarded verbatim to
  // ShapeBase.rotation - gridMatrix's vertical axis name (doc/spec.md
  // §6.2.16), since text shapes have no vertical writing mode. Undefined
  // behaves as 0.
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
