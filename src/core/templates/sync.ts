import { v4 as uuidv4 } from "uuid";
import type { Document, OutlineNode, StructuredBlock } from "../model/document";
import { DEFAULT_LAYER_ID } from "../model/document";
import type { LineShape, Shape, ShapeId, TextShape } from "../model/shape";
import {
  contrastTextColor,
  defaultShapeStyle,
  filledShapeStyle,
  getColorTheme,
  headingStyle,
  labelStyle,
  outlineStyle,
  resolveColorSlot,
  neutralPanelStyle,
  ruleStyle,
  separatorStyle,
  strokeOnlyStyle,
  timelineTrackStyle,
  treeConnectorStyle,
} from "../model/style";
import type { ShapeStyle } from "../model/style";
import type { LayoutNode } from "./layoutNode";
import { emptyNode } from "./patternDefinition";
import type { RawParams } from "./patternDefinition";
import { patternOf } from "./registry";

// All functions here take a plain Document and return a new plain Document -
// no Immer/store dependency, so they're directly unit-testable. documentStore
// wires them into the Undo/Redo-tracked change() helper (see doc/spec.md §6.3).
//
// Pattern-specific behavior (layout, how each kind of edit re-places shapes,
// prefilled nodes) comes from the pattern's PatternDefinition (registry.ts).

// Patterns whose shape positions are determined by the outline as a whole
// regenerate all of their shapes on every add/delete; only the tree patterns
// place one node's shape incrementally (see PatternDefinition.tree).
function isFullyRelayoutedPattern(pattern: StructuredBlock["pattern"]): boolean {
  return patternOf(pattern).tree === undefined;
}

function layoutFor(pattern: StructuredBlock["pattern"], outline: OutlineNode[], params: RawParams = {}): LayoutNode[] {
  const definition = patternOf(pattern);
  const nodes = definition.layout(outline, params);
  return definition.normalizeOrigin ? normalizeToOrigin(nodes) : nodes;
}

// Every caller treats a LayoutNode's (x, y) as an offset added to the block's
// placement origin (originOfBlock below), which assumes the layout's own
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

// Resolves a LayoutNode's full ShapeStyle: a base style from its `kind`
// (falling back to defaultShapeStyle's bordered box for "text"/undefined),
// with fontWeight/italic/underline/textColorSlot layered on top where set -
// decorations a kind's own style function doesn't hardcode, so a pattern can
// reuse a kind (e.g. "label") with a different look per LayoutNode instead of
// every decoration combination needing its own kind (see layoutNode.ts).
function styleFor(themeId: string, layoutNode: LayoutNode): ShapeStyle {
  const theme = getColorTheme(themeId);
  const base: ShapeStyle =
    layoutNode.kind === "ellipse" || layoutNode.kind === "rect"
      ? layoutNode.fillColorSlot !== undefined
        ? filledShapeStyle(themeId, layoutNode.fillColorSlot)
        : layoutNode.strokeColorSlot !== undefined
          ? strokeOnlyStyle(themeId, layoutNode.strokeColorSlot)
          : layoutNode.neutralFill
          ? neutralPanelStyle()
          : outlineStyle(themeId, layoutNode.dashed === true)
      : layoutNode.kind === "line"
        ? layoutNode.trackStyle
          ? timelineTrackStyle()
          : layoutNode.dashed === false
            ? ruleStyle(themeId)
            : separatorStyle(themeId)
        : layoutNode.kind === "label"
          ? labelStyle(themeId, layoutNode.fontSize)
          : layoutNode.kind === "polygon" && layoutNode.strokeColorSlot !== undefined
            ? strokeOnlyStyle(themeId, layoutNode.strokeColorSlot)
            : layoutNode.kind === "heading" || layoutNode.kind === "polygon"
              ? layoutNode.kind === "polygon" && layoutNode.neutralFill
                ? neutralPanelStyle()
                : headingStyle(themeId, layoutNode.fontSize, layoutNode.fillColorSlot)
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

function findBlock(doc: Document, blockId: string): StructuredBlock | undefined {
  return doc.structuredBlocks.find((b) => b.id === blockId);
}

function findNode(nodes: OutlineNode[], nodeId: string): OutlineNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const found = findNode(node.children, nodeId);
    if (found) return found;
  }
  return undefined;
}

interface SiblingLocation {
  parentId: string | null;
  siblings: OutlineNode[];
  index: number;
}

function getSiblingsAndIndex(nodes: OutlineNode[], nodeId: string, parentId: string | null = null): SiblingLocation | undefined {
  const index = nodes.findIndex((n) => n.id === nodeId);
  if (index !== -1) return { parentId, siblings: nodes, index };
  for (const node of nodes) {
    const found = getSiblingsAndIndex(node.children, nodeId, node.id);
    if (found) return found;
  }
  return undefined;
}

// Rebuilds the tree with `parentId`'s children array (or the root array, for
// parentId null) replaced by `updater(currentChildren)`.
function updateChildren(nodes: OutlineNode[], parentId: string | null, updater: (children: OutlineNode[]) => OutlineNode[]): OutlineNode[] {
  if (parentId === null) return updater(nodes);
  return nodes.map((node) =>
    node.id === parentId
      ? { ...node, children: updater(node.children) }
      : { ...node, children: updateChildren(node.children, parentId, updater) },
  );
}

function mapOutline(nodes: OutlineNode[], fn: (node: OutlineNode) => OutlineNode): OutlineNode[] {
  return nodes.map((node) => {
    const updated = fn(node);
    return { ...updated, children: mapOutline(updated.children, fn) };
  });
}

function collectSubtreeIds(node: OutlineNode): string[] {
  return [node.id, ...node.children.flatMap(collectSubtreeIds)];
}

function removeNodeFromTree(nodes: OutlineNode[], nodeId: string): OutlineNode[] {
  return nodes.filter((n) => n.id !== nodeId).map((n) => ({ ...n, children: removeNodeFromTree(n.children, nodeId) }));
}

function findShapeForNode(doc: Document, block: StructuredBlock, nodeId: string): Shape | undefined {
  for (const shapeId of block.generatedShapeIds) {
    const shape = doc.shapes[shapeId];
    if (shape?.templateNodeIds?.includes(nodeId)) return shape;
  }
  return undefined;
}

// The tree patterns' connector direction (PatternDefinition.tree); undefined
// for every other pattern, which draws no parent-child connector lines.
function treeConnectorDirection(pattern: StructuredBlock["pattern"]): "down" | "right" | undefined {
  return patternOf(pattern).tree?.direction;
}

function toLineShapes(segments: Array<[number, number, number, number]>, zIndexStart: number): LineShape[] {
  const style = treeConnectorStyle();
  return segments.map(([x1, y1, x2, y2], i) => ({
    id: uuidv4(),
    type: "line",
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    rotation: 0,
    style,
    zIndex: zIndexStart + i,
    templateNodeIds: [],
  }));
}

// One parent's worth of elbow-jointed connector lines: a stub from the
// parent's own edge (bottom-center for "down", right-center for "right"), a
// "bus" spanning its children's centers on the cross axis (skipped when
// there's only one child, since it would have zero length), then a stub from
// the bus into each child's facing edge-center - the typical org-chart/
// tree-diagram look (see the ツリー図 reference image this was built from).
// The bus sits halfway between the parent's edge and its (nearest, in case
// children ended up unevenly placed) child's facing edge, so the two stubs
// on the primary axis always come out equal length, rather than at a fixed
// distance from the parent that reads as off-center whenever the gap between
// rows/columns isn't exactly double that fixed distance. Untracked
// (`templateNodeIds: []`, same convention as bulletMatrix's grid lines):
// purely structural, not tied to a specific outline node.
function elbowConnectorShapes(parent: Shape, children: Shape[], zIndexStart: number, direction: "down" | "right"): LineShape[] {
  if (direction === "right") {
    const parentAnchorX = parent.x + parent.width;
    const parentAnchorY = parent.y + parent.height / 2;
    const nearestChildLeftX = Math.min(...children.map((c) => c.x));
    const branchX = parentAnchorX + (nearestChildLeftX - parentAnchorX) / 2;
    const childCenterYs = children.map((c) => c.y + c.height / 2);
    const topY = Math.min(...childCenterYs);
    const bottomY = Math.max(...childCenterYs);

    const segments: Array<[number, number, number, number]> = [[parentAnchorX, parentAnchorY, branchX, parentAnchorY]];
    if (bottomY > topY) segments.push([branchX, topY, branchX, bottomY]);
    for (const child of children) {
      const cy = child.y + child.height / 2;
      segments.push([branchX, cy, child.x, cy]);
    }
    return toLineShapes(segments, zIndexStart);
  }

  const parentAnchorX = parent.x + parent.width / 2;
  const parentAnchorY = parent.y + parent.height;
  const nearestChildTopY = Math.min(...children.map((c) => c.y));
  const branchY = parentAnchorY + (nearestChildTopY - parentAnchorY) / 2;
  const childCenterXs = children.map((c) => c.x + c.width / 2);
  const leftX = Math.min(...childCenterXs);
  const rightX = Math.max(...childCenterXs);

  const segments: Array<[number, number, number, number]> = [[parentAnchorX, parentAnchorY, parentAnchorX, branchY]];
  if (rightX > leftX) segments.push([leftX, branchY, rightX, branchY]);
  for (const child of children) {
    const cx = child.x + child.width / 2;
    segments.push([cx, branchY, cx, child.y]);
  }
  return toLineShapes(segments, zIndexStart);
}

// Rebuilds every parent-child connector line for a "pyramid"/"logicTree"
// (ツリー図/ロジックツリー) block, deriving each one from the CURRENT actual
// position of its parent/child shapes - not from treeLayout.ts's idealized
// cursor layout, which these patterns' incremental add/delete placement
// (buildNodeShape above) doesn't necessarily match (and which manual
// repositioning on the canvas would diverge from anyway). Called after every
// structural edit (add/delete/indent/outdent/move/bulk-import - see each
// call site below); a no-op for any other pattern. Old connectors are
// tracked via params._treeConnectorShapeIds (same "untracked shape, own
// params slot" convention as matrix's _axisShapeIds) and always fully
// discarded and redrawn rather than diffed, since a single child add/remove
// can change where the bus needs to start/end.
function regenerateTreeConnectors(doc: Document, blockId: string): Document {
  const block = findBlock(doc, blockId);
  const maybeDirection = block && treeConnectorDirection(block.pattern);
  if (!block || !maybeDirection) return doc;
  const direction: "down" | "right" = maybeDirection;

  const oldIds = (block.params._treeConnectorShapeIds as ShapeId[] | undefined) ?? [];
  const oldIdSet = new Set(oldIds);
  const shapes = { ...doc.shapes };
  for (const id of oldIds) delete shapes[id];

  function shapeFor(nodeId: string): Shape | undefined {
    for (const shapeId of block!.generatedShapeIds) {
      if (oldIdSet.has(shapeId)) continue;
      const shape = shapes[shapeId];
      if (shape?.templateNodeIds?.includes(nodeId)) return shape;
    }
    return undefined;
  }

  const newShapes: LineShape[] = [];
  function walk(node: OutlineNode) {
    if (node.children.length > 0) {
      const parentShape = shapeFor(node.id);
      const childShapes = node.children.map((c) => shapeFor(c.id)).filter((s): s is Shape => Boolean(s));
      if (parentShape && childShapes.length > 0) {
        newShapes.push(
          ...elbowConnectorShapes(parentShape, childShapes, Object.keys(shapes).length + newShapes.length, direction),
        );
      }
    }
    for (const child of node.children) walk(child);
  }
  for (const root of block.outline) walk(root);

  for (const s of newShapes) shapes[s.id] = s;
  const newIds = newShapes.map((s) => s.id);

  const layers = doc.layers.map((layer) =>
    layer.id === DEFAULT_LAYER_ID
      ? { ...layer, shapeIds: [...layer.shapeIds.filter((id) => !oldIdSet.has(id)), ...newIds] }
      : layer,
  );

  return withBlock({ ...doc, shapes, layers }, blockId, (b) => ({
    ...b,
    params: { ...b.params, _treeConnectorShapeIds: newIds },
    generatedShapeIds: [...b.generatedShapeIds.filter((id) => !oldIdSet.has(id)), ...newIds],
  }));
}

function appendShapeToDocument(doc: Document, shape: Shape): Pick<Document, "shapes" | "layers"> {
  return {
    shapes: { ...doc.shapes, [shape.id]: shape },
    layers: doc.layers.map((layer) =>
      layer.id === DEFAULT_LAYER_ID ? { ...layer, shapeIds: [...layer.shapeIds, shape.id] } : layer,
    ),
  };
}

const DEFAULT_NODE_WIDTH = 160;
const DEFAULT_NODE_HEIGHT = 60;
// Visual gap for incremental placement's offsets below - matches
// pyramid.ts's/logicTree.ts's own layoutTree GAP, so a tree built via the
// primary node-by-node UI reads with the same rhythm as one built via bulk
// import (which goes through that GAP directly - see rawLayoutFor above).
const TREE_NODE_GAP = 36;

// Position offset for a newly-added node's shape, relative to a reference
// shape (the parent, for a new child; the preceding sibling, for a new
// sibling) - sized from the REFERENCE shape's own current width/height, not
// a fixed total offset baked in for the original 160x60 default. A fixed
// total offset (this function's previous approach) produces a visual gap
// that only comes out to TREE_NODE_GAP when every node happens to still be
// exactly the default size; once a reference node's size differs (a manual
// resize, or - as reported - a tree built up over several sessions whose
// underlying constants changed between them, since each shape's offset was
// permanently baked in at creation time) neighboring gaps stop matching each
// other, which is what "the gap between two siblings is way bigger than
// another pair" (the reported bug) looks like. Direction depends on the
// pattern's layout axis (doc/spec.md §6.3).
function newNodeOffset(pattern: StructuredBlock["pattern"], relation: "child" | "sibling", referenceShape: Shape | undefined): { x: number; y: number } {
  const down = treeConnectorDirection(pattern) !== "right";
  const refWidth = referenceShape?.width ?? DEFAULT_NODE_WIDTH;
  const refHeight = referenceShape?.height ?? DEFAULT_NODE_HEIGHT;
  if (relation === "child") return down ? { x: 0, y: refHeight + TREE_NODE_GAP } : { x: refWidth + TREE_NODE_GAP, y: 0 };
  return down ? { x: refWidth + TREE_NODE_GAP, y: 0 } : { x: 0, y: refHeight + TREE_NODE_GAP };
}

function buildNodeShape(
  doc: Document,
  block: StructuredBlock,
  newNode: OutlineNode,
  referenceNodeId: string | undefined,
  relation: "child" | "sibling",
): TextShape {
  const referenceShape = referenceNodeId ? findShapeForNode(doc, block, referenceNodeId) : undefined;
  const offset = newNodeOffset(block.pattern, relation, referenceShape);
  const position = referenceShape
    ? { x: referenceShape.x + offset.x, y: referenceShape.y + offset.y }
    : { x: 40, y: 40 };

  return {
    id: uuidv4(),
    type: "text",
    x: position.x,
    y: position.y,
    width: referenceShape?.width ?? DEFAULT_NODE_WIDTH,
    height: referenceShape?.height ?? DEFAULT_NODE_HEIGHT,
    rotation: 0,
    style: defaultShapeStyle(doc.colorThemeId),
    zIndex: Object.keys(doc.shapes).length,
    templateNodeIds: [newNode.id],
    content: newNode.text,
    align: "center",
  };
}

function withBlock(doc: Document, blockId: string, updater: (block: StructuredBlock) => StructuredBlock): Document {
  return {
    ...doc,
    structuredBlocks: doc.structuredBlocks.map((b) => (b.id === blockId ? updater(b) : b)),
  };
}

// --- Public API ---------------------------------------------------------

export function addEmptyStructuredBlock(doc: Document, pattern: StructuredBlock["pattern"]): { document: Document; blockId: string } {
  const block: StructuredBlock = { id: uuidv4(), pattern, outline: [], params: {}, generatedShapeIds: [] };
  return { document: { ...doc, structuredBlocks: [...doc.structuredBlocks, block] }, blockId: block.id };
}

function newRootNode(block: StructuredBlock): OutlineNode {
  return patternOf(block.pattern).newRoot?.(block.params) ?? emptyNode();
}

function newChildNode(block: StructuredBlock, parentNodeId: string): OutlineNode {
  return patternOf(block.pattern).newChild?.(block.outline, parentNodeId, block.params) ?? emptyNode();
}

export function addFirstOutlineNode(doc: Document, blockId: string): Document {
  const block = findBlock(doc, blockId);
  if (!block || block.outline.length > 0) return doc;
  const initialOutline = patternOf(block.pattern).initialOutline?.(block.params);
  if (initialOutline) return regenerateBlockShapes(doc, block, initialOutline);
  const newNode: OutlineNode = newRootNode(block);

  if (isFullyRelayoutedPattern(block.pattern)) {
    return regenerateBlockShapes(doc, block, [newNode]);
  }

  const shape = buildNodeShape(doc, block, newNode, undefined, "sibling");
  const { shapes, layers } = appendShapeToDocument(doc, shape);
  return withBlock({ ...doc, shapes, layers }, blockId, (b) => ({
    ...b,
    outline: [newNode],
    generatedShapeIds: [...b.generatedShapeIds, shape.id],
  }));
}

export function addOutlineChild(doc: Document, blockId: string, parentNodeId: string): Document {
  const block = findBlock(doc, blockId);
  if (!block || !findNode(block.outline, parentNodeId)) return doc;
  const newNode: OutlineNode = newChildNode(block, parentNodeId);
  const newOutline = updateChildren(block.outline, parentNodeId, (children) => [...children, newNode]);

  if (isFullyRelayoutedPattern(block.pattern)) {
    return regenerateBlockShapes(doc, block, newOutline);
  }

  const shape = buildNodeShape(doc, block, newNode, parentNodeId, "child");
  const { shapes, layers } = appendShapeToDocument(doc, shape);
  const next = withBlock({ ...doc, shapes, layers }, blockId, (b) => ({
    ...b,
    outline: newOutline,
    generatedShapeIds: [...b.generatedShapeIds, shape.id],
  }));
  return regenerateTreeConnectors(next, blockId);
}

export function addOutlineSibling(doc: Document, blockId: string, afterNodeId: string): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  const loc = getSiblingsAndIndex(block.outline, afterNodeId);
  if (!loc) return doc;

  const newNode: OutlineNode = loc.parentId === null ? newRootNode(block) : emptyNode();
  const newOutline = updateChildren(block.outline, loc.parentId, (children) => [
    ...children.slice(0, loc.index + 1),
    newNode,
    ...children.slice(loc.index + 1),
  ]);

  if (isFullyRelayoutedPattern(block.pattern)) {
    return regenerateBlockShapes(doc, block, newOutline);
  }

  const shape = buildNodeShape(doc, block, newNode, afterNodeId, "sibling");
  const { shapes, layers } = appendShapeToDocument(doc, shape);
  const next = withBlock({ ...doc, shapes, layers }, blockId, (b) => ({
    ...b,
    outline: newOutline,
    generatedShapeIds: [...b.generatedShapeIds, shape.id],
  }));
  return regenerateTreeConnectors(next, blockId);
}

export function deleteOutlineNode(doc: Document, blockId: string, nodeId: string): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  const target = findNode(block.outline, nodeId);
  if (!target) return doc;
  const newOutline = removeNodeFromTree(block.outline, nodeId);

  if (isFullyRelayoutedPattern(block.pattern)) {
    return regenerateBlockShapes(doc, block, newOutline);
  }

  const idsToRemove = new Set(collectSubtreeIds(target));
  const shapes = { ...doc.shapes };
  const removedShapeIds: ShapeId[] = [];
  for (const shapeId of block.generatedShapeIds) {
    const shape = shapes[shapeId];
    if (shape?.templateNodeIds?.some((id) => idsToRemove.has(id))) {
      delete shapes[shapeId];
      removedShapeIds.push(shapeId);
    }
  }

  const layers = doc.layers.map((layer) => ({
    ...layer,
    shapeIds: layer.shapeIds.filter((id) => !removedShapeIds.includes(id)),
  }));

  const next = withBlock({ ...doc, shapes, layers }, blockId, (b) => ({
    ...b,
    outline: newOutline,
    generatedShapeIds: b.generatedShapeIds.filter((id) => !removedShapeIds.includes(id)),
  }));
  return regenerateTreeConnectors(next, blockId);
}

export function updateOutlineNodeText(doc: Document, blockId: string, nodeId: string, text: string): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  const newOutline = mapOutline(block.outline, (node) => (node.id === nodeId ? { ...node, text } : node));

  if (patternOf(block.pattern).regenerateOnTextEdit) {
    return regenerateBlockShapes(doc, block, newOutline);
  }

  const shapes = { ...doc.shapes };
  for (const shapeId of block.generatedShapeIds) {
    const shape = shapes[shapeId];
    if (shape?.type === "text" && shape.templateNodeIds?.includes(nodeId)) {
      shapes[shapeId] = { ...shape, content: text };
    }
  }

  return withBlock({ ...doc, shapes }, blockId, (b) => ({ ...b, outline: newOutline }));
}

// The other sync direction: editing a generated text shape's content directly
// on the canvas updates its outline node(s) (doc/spec.md §6.3). A no-op for
// shapes that aren't part of any structured block.
export function updateShapeContentAndSync(doc: Document, shapeId: ShapeId, content: string): Document {
  const shape = doc.shapes[shapeId];
  if (!shape || shape.type !== "text") return doc;

  const owningBlock = shape.templateNodeIds?.length
    ? doc.structuredBlocks.find((b) => b.generatedShapeIds.includes(shapeId))
    : undefined;
  if (!owningBlock) {
    return { ...doc, shapes: { ...doc.shapes, [shapeId]: { ...shape, content } } };
  }

  let outline = owningBlock.outline;
  for (const nodeId of shape.templateNodeIds!) {
    outline = mapOutline(outline, (node) => (node.id === nodeId ? { ...node, text: content } : node));
  }

  if (patternOf(owningBlock.pattern).regenerateOnTextEdit === "panelAndCanvas") {
    return regenerateBlockShapes(doc, owningBlock, outline);
  }

  const shapes = { ...doc.shapes, [shapeId]: { ...shape, content } };
  return withBlock({ ...doc, shapes }, owningBlock.id, (b) => ({ ...b, outline }));
}

// Changes a block's params - a title, column headers, axis labels, a
// schedule's month range/milestones/dependency links, ... (doc/spec.md §6.2):
// everything a pattern keeps outside the outline because it has no natural
// place in the node tree. `patch` is merged over the current params, the
// pattern's PatternDefinition.onParamsChange gets a chance to normalize them
// and reshape the outline to match (e.g. one cell per column), and the whole
// (cheap, single-block) diagram is regenerated, since any of these can move
// every other shape.
export function updateBlockParams(doc: Document, blockId: string, patch: RawParams): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  const merged = { ...block.params, ...patch };
  const { outline, params } = patternOf(block.pattern).onParamsChange?.(block.outline, merged, patch) ?? {
    outline: block.outline,
    params: merged,
  };
  return regenerateBlockShapes(doc, { ...block, params }, outline);
}

// params._axisShapeIds only exists on matrix blocks saved before the
// redesign (doc/spec.md §6.2.1), whose axis labels were separately-placed
// shapes outside the grid; they're excluded so the first regenerate of such a
// block (which drops them - they're in generatedShapeIds too - and lays the
// labels out with the rest) keeps the grid anchored where it was.
function originOfBlock(doc: Document, block: StructuredBlock): { x: number; y: number } {
  const axisShapeIds = new Set((block.params._axisShapeIds as ShapeId[] | undefined) ?? []);
  const shapes = block.generatedShapeIds
    .filter((id) => !axisShapeIds.has(id))
    .map((id) => doc.shapes[id])
    .filter((s): s is Shape => Boolean(s));
  if (shapes.length === 0) return { x: 40, y: 40 };
  const corners = shapes.map(visualTopLeft);
  return { x: Math.min(...corners.map((c) => c.x)), y: Math.min(...corners.map((c) => c.y)) };
}

// Top-left of a shape's bounding box as drawn, i.e. after its rotation around
// its own center. Layouts place a rotated LayoutNode (gridMatrix's vertical
// axis name) by where it ends up on screen, so its unrotated box can stick out
// past the block's visible top-left; measuring the origin from that box would
// shift the whole block on every regenerate.
function visualTopLeft(shape: Shape): { x: number; y: number } {
  if (!shape.rotation) return { x: shape.x, y: shape.y };
  const rad = (shape.rotation * Math.PI) / 180;
  // Rounded so a quarter turn yields exactly 0/1 - cos(-90°) is ~6e-17, which
  // would otherwise nudge the block by a hair on every regenerate.
  const cos = Math.abs(Math.round(Math.cos(rad) * 1e9) / 1e9);
  const sin = Math.abs(Math.round(Math.sin(rad) * 1e9) / 1e9);
  const halfWidth = (shape.width * cos + shape.height * sin) / 2;
  const halfHeight = (shape.width * sin + shape.height * cos) / 2;
  return { x: shape.x + shape.width / 2 - halfWidth, y: shape.y + shape.height / 2 - halfHeight };
}

// Recomputes every generated shape's position from a fresh layout of
// `newOutline`, keeping each shape's own id (and any style customization) by
// matching on templateNodeIds. Used after restructuring (indent/outdent/move)
// where the tree shape changed but no nodes were added or removed, for
// patterns whose PatternDefinition.restructure is "relayout".
function relayoutBlock(doc: Document, block: StructuredBlock, newOutline: OutlineNode[]): Document {
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

// Indent/outdent/move: re-places shapes as the pattern's
// PatternDefinition.restructure says, then resyncs the tree patterns'
// connector lines - relayoutBlock repositions every ordinary node shape but,
// having no templateNodeIds, never touches connector shapes, which would
// otherwise keep pointing at their pre-restructure positions.
function relayoutOrRegenerate(doc: Document, block: StructuredBlock, newOutline: OutlineNode[]): Document {
  const next =
    patternOf(block.pattern).restructure === "regenerate"
      ? regenerateBlockShapes(doc, block, newOutline)
      : relayoutBlock(doc, block, newOutline);
  return regenerateTreeConnectors(next, block.id);
}

export function indentOutlineNode(doc: Document, blockId: string, nodeId: string): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  const loc = getSiblingsAndIndex(block.outline, nodeId);
  if (!loc || loc.index === 0) return doc; // no preceding sibling to become the new parent

  const node = loc.siblings[loc.index];
  const newParentId = loc.siblings[loc.index - 1].id;

  let newOutline = updateChildren(block.outline, loc.parentId, (children) => children.filter((_, i) => i !== loc.index));
  newOutline = updateChildren(newOutline, newParentId, (children) => [...children, node]);

  return relayoutOrRegenerate(doc, block, newOutline);
}

export function outdentOutlineNode(doc: Document, blockId: string, nodeId: string): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  const loc = getSiblingsAndIndex(block.outline, nodeId);
  if (!loc || loc.parentId === null) return doc; // already at root level

  const node = loc.siblings[loc.index];
  const grandParentLoc = getSiblingsAndIndex(block.outline, loc.parentId);
  const grandParentId = grandParentLoc ? grandParentLoc.parentId : null;

  let newOutline = updateChildren(block.outline, loc.parentId, (children) => children.filter((_, i) => i !== loc.index));
  newOutline = updateChildren(newOutline, grandParentId, (children) => {
    const parentIndex = children.findIndex((n) => n.id === loc.parentId);
    return [...children.slice(0, parentIndex + 1), node, ...children.slice(parentIndex + 1)];
  });

  return relayoutOrRegenerate(doc, block, newOutline);
}

export function moveOutlineNode(doc: Document, blockId: string, nodeId: string, direction: "up" | "down"): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  const loc = getSiblingsAndIndex(block.outline, nodeId);
  if (!loc) return doc;
  const targetIndex = direction === "up" ? loc.index - 1 : loc.index + 1;
  if (targetIndex < 0 || targetIndex >= loc.siblings.length) return doc;

  const newOutline = updateChildren(block.outline, loc.parentId, (children) => {
    const copy = [...children];
    [copy[loc.index], copy[targetIndex]] = [copy[targetIndex], copy[loc.index]];
    return copy;
  });

  return relayoutOrRegenerate(doc, block, newOutline);
}

// Bulk replace (paste import, doc/spec.md §6.1): discards every shape this
// block previously generated and lays out fresh ones for the new outline.
// `paramsPatch` sets params that the imported text carries alongside the
// outline (bulletMatrix's column headers, doc/spec.md §6.2.4), merged in the
// same regeneration since the layout needs both. The outline is taken as
// imported - onParamsChange isn't applied.
export function replaceOutline(doc: Document, blockId: string, newOutline: OutlineNode[], paramsPatch: RawParams = {}): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  const next = regenerateBlockShapes(doc, { ...block, params: { ...block.params, ...paramsPatch } }, newOutline);
  return regenerateTreeConnectors(next, blockId);
}

// Discards every shape `block` previously generated (by nodeId) and lays out
// fresh ones for `newOutline`, using `block.params` for layout (so callers
// that also change params, e.g. updateBlockParams, should pass a `block`
// with those params already merged in). Shared by replaceOutline (bulk
// import, any pattern) and every matrix/venn edit (doc/spec.md §6.2.1/§6.2.2 -
// their shape positions depend on the whole outline, not just the edited
// node, so incremental placement like pyramid/logicTree's doesn't apply).
function regenerateBlockShapes(doc: Document, block: StructuredBlock, newOutline: OutlineNode[]): Document {
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
