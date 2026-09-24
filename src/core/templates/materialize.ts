import { v4 as uuidv4 } from "uuid";
import type { Document, OutlineNode, StructuredBlock } from "../model/document";
import { DEFAULT_LAYER_ID } from "../model/document";
import type { Shape, ShapeId } from "../model/shape";
import {
  contrastTextColor,
  defaultShapeStyle,
  filledShapeStyle,
  getColorTheme,
  headingStyle,
  labelStyle,
  neutralPanelStyle,
  resolveColorSlot,
  strokeOnlyStyle,
  timelineTrackStyle,
} from "../model/style";
import type { ShapeStyle } from "../model/style";
import { originOfBlock, withBlock } from "./blockDocument";
import { paintOf } from "./layoutNode";
import type { LayoutNode, Paint } from "./layoutNode";
import type { RawParams } from "./patternDefinition";
import { patternOf } from "./registry";

// Turns a pattern's layout (LayoutNode[]) into the block's actual shapes:
// either from scratch (regenerateBlockShapes) or by moving the existing ones
// (relayoutBlock), placed at the block's current origin and styled from the
// document's color theme.

function layoutFor(pattern: StructuredBlock["pattern"], outline: OutlineNode[], params: RawParams = {}): LayoutNode[] {
  const definition = patternOf(pattern);
  const nodes = definition.layout(outline, params);
  return definition.normalizeOrigin ? normalizeToOrigin(nodes) : nodes;
}

// Every caller treats a LayoutNode's (x, y) as an offset added to the block's
// placement origin (blockDocument.ts's originOfBlock), which assumes the layout's own
// minimum x/y is 0 - true for cursor-based placement starting at (0, 0), but
// not for e.g. venn.ts, whose circle layout is centered on (0, 0) and so
// spans negative coordinates. Shifting every node so the layout's own
// bounding box starts at (0, 0) (for patterns that set
// PatternDefinition.normalizeOrigin) keeps that assumption true without each
// such layout having to compensate itself.
function normalizeToOrigin(nodes: LayoutNode[]): LayoutNode[] {
  if (nodes.length === 0) return nodes;
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  if (minX === 0 && minY === 0) return nodes;
  return nodes.map((n) => ({ ...n, x: n.x - minX, y: n.y - minY }));
}

// The fill/stroke a Paint stands for (see layoutNode.ts's Paint).
function paintStyle(themeId: string, paint: Paint): ShapeStyle {
  if (paint === "neutral") return neutralPanelStyle();
  if (paint === "track") return timelineTrackStyle();
  if ("fill" in paint) return filledShapeStyle(themeId, paint.fill);
  return strokeOnlyStyle(themeId, paint.stroke, paint.dashed === true);
}

// Resolves a LayoutNode's full ShapeStyle: the kind's text style (for the
// text-bearing kinds), its paint (per-kind default applied - paintOf), then
// fontWeight/italic/underline/textColorSlot/contrastBgColorSlot on top where
// set - decorations a kind's own style doesn't hardcode, so a pattern can
// reuse a kind (e.g. "label") with a different look per LayoutNode instead of
// every combination needing its own kind (see layoutNode.ts).
function styleFor(themeId: string, layoutNode: LayoutNode): ShapeStyle {
  const theme = getColorTheme(themeId);
  const paint = paintOf(layoutNode);
  const base: ShapeStyle =
    layoutNode.kind === "label"
      ? labelStyle(themeId, layoutNode.fontSize)
      : layoutNode.kind === "heading"
        ? { ...headingStyle(themeId, layoutNode.fontSize), ...paintStyle(themeId, paint!) }
        : paint
          ? paintStyle(themeId, paint)
          : defaultShapeStyle(themeId);
  return {
    ...base,
    ...(layoutNode.fontWeight ? { fontWeight: layoutNode.fontWeight } : {}),
    ...(layoutNode.italic ? { fontStyle: "italic" as const } : {}),
    ...(layoutNode.underline ? { textDecoration: "underline" as const } : {}),
    ...(layoutNode.textColorSlot !== undefined ? { textColor: resolveColorSlot(theme, layoutNode.textColorSlot) } : {}),
    ...(layoutNode.contrastBgColorSlot !== undefined
      ? { textColor: contrastTextColor(theme, resolveColorSlot(theme, layoutNode.contrastBgColorSlot)) }
      : {}),
  };
}

// Recomputes every generated shape's position from a fresh layout of
// `newOutline`, keeping each shape's own id (and any style customization) by
// matching on templateNodeIds. Used after restructuring (indent/outdent/move)
// where the tree shape changed but no nodes were added or removed - only for
// the tree patterns (see PatternDefinition.tree for why).
export function relayoutBlock(doc: Document, block: StructuredBlock, newOutline: OutlineNode[]): Document {
  const origin = originOfBlock(doc, block);
  const layoutByNodeId = new Map<string, LayoutNode>();
  for (const layoutNode of layoutFor(block.pattern, newOutline, block.params)) {
    for (const nid of layoutNode.nodeIds) layoutByNodeId.set(nid, layoutNode);
  }

  const shapes = { ...doc.shapes };
  for (const shapeId of block.generatedShapeIds) {
    const shape = shapes[shapeId];
    if (!shape?.templateNodeIds?.length) continue;
    const layoutNode = shape.templateNodeIds.map((id) => layoutByNodeId.get(id)).find((l): l is LayoutNode => Boolean(l));
    if (!layoutNode) continue;
    shapes[shapeId] = { ...shape, x: origin.x + layoutNode.x, y: origin.y + layoutNode.y };
  }

  return withBlock({ ...doc, shapes }, block.id, (b) => ({ ...b, outline: newOutline }));
}

// Discards every shape `block` previously generated (by nodeId) and lays out
// fresh ones for `newOutline`, using `block.params` for layout (so callers
// that also change params, e.g. updateBlockParams, should pass a `block`
// with those params already merged in). Shared by replaceOutline (bulk
// import, any pattern) and every matrix/venn edit (doc/spec.md §6.2.1/§6.2.2 -
// their shape positions depend on the whole outline, not just the edited
// node, so incremental placement like pyramid/logicTree's doesn't apply).
export function regenerateBlockShapes(doc: Document, block: StructuredBlock, newOutline: OutlineNode[]): Document {
  const origin = originOfBlock(doc, block);
  const shapes = { ...doc.shapes };
  for (const id of block.generatedShapeIds) delete shapes[id];

  const newShapeIds: ShapeId[] = [];
  let zIndex = Object.keys(shapes).length;
  for (const layoutNode of layoutFor(block.pattern, newOutline, block.params)) {
    const base = {
      id: uuidv4(),
      x: origin.x + layoutNode.x,
      y: origin.y + layoutNode.y,
      width: layoutNode.width,
      height: layoutNode.height,
      rotation: layoutNode.rotation ?? 0,
      zIndex: zIndex++,
      templateNodeIds: layoutNode.nodeIds,
    };
    const style = styleFor(doc.colorThemeId, layoutNode);
    const shape: Shape =
      layoutNode.kind === "ellipse"
        ? { ...base, type: "ellipse", style }
        : layoutNode.kind === "rect"
          ? { ...base, type: "rect", style, cornerRadius: layoutNode.cornerRadius }
          : layoutNode.kind === "line"
            ? layoutNode.arrowhead
              ? {
                  ...base,
                  type: "arrow",
                  style,
                  points: [
                    { x: base.x, y: base.y },
                    { x: base.x + base.width, y: base.y + base.height },
                  ],
                }
              : { ...base, type: "line", style }
            : layoutNode.kind === "polygon"
              ? { ...base, type: "polygon", style, points: layoutNode.points ?? [] }
              : {
                  ...base,
                  type: "text",
                  style,
                  content: layoutNode.text,
                  align: layoutNode.align ?? "center",
                  bulletMarker: layoutNode.bulletMarker,
                };
    shapes[shape.id] = shape;
    newShapeIds.push(shape.id);
  }

  const oldShapeIds = new Set(block.generatedShapeIds);
  const layers = doc.layers.map((layer) =>
    layer.id === DEFAULT_LAYER_ID
      ? { ...layer, shapeIds: [...layer.shapeIds.filter((id) => !oldShapeIds.has(id)), ...newShapeIds] }
      : layer,
  );

  return withBlock({ ...doc, shapes, layers }, block.id, (b) => ({
    ...b,
    params: block.params,
    outline: newOutline,
    generatedShapeIds: newShapeIds,
  }));
}
