import { v4 as uuidv4 } from "uuid";
import type { Document, OutlineNode, StructuredBlock } from "../model/document";
import { DEFAULT_LAYER_ID } from "../model/document";
import type { Shape, ShapeId, TextShape } from "../model/shape";
import { defaultShapeStyle, labelStyle, outlineStyle } from "../model/style";
import { layoutPyramid } from "./pyramid";
import { layoutLogicTree } from "./logicTree";
import { layoutMatrix, layoutMatrixAxisLabels } from "./matrix";
import type { MatrixAxisParams } from "./matrix";
import { layoutVenn, VENN_MAX_SETS, VENN_MIN_SETS } from "./venn";
import type { LayoutNode } from "./treeLayout";

// All functions here take a plain Document and return a new plain Document -
// no Immer/store dependency, so they're directly unit-testable. documentStore
// wires them into the Undo/Redo-tracked change() helper (see doc/spec.md §6.3).

// Patterns whose shape positions are fully determined by the current outline
// as a whole (fixed quadrant slots / text-based set-membership grouping)
// rather than by incremental placement relative to one reference shape.
// Every outline edit regenerates all of their shapes from scratch instead of
// the pyramid/logicTree incremental add/delete path (see regenerateBlockShapes
// below and doc/spec.md §6.2.1/§6.2.2).
function isFullyRelayoutedPattern(pattern: StructuredBlock["pattern"]): boolean {
  return pattern === "matrix" || pattern === "venn";
}

function vennSetCount(params: Record<string, unknown>): number {
  const raw = params.setCount;
  const n = typeof raw === "number" ? raw : VENN_MAX_SETS;
  return Math.max(VENN_MIN_SETS, Math.min(VENN_MAX_SETS, n));
}

function layoutFor(pattern: StructuredBlock["pattern"], outline: OutlineNode[], params: Record<string, unknown> = {}): LayoutNode[] {
  const nodes = rawLayoutFor(pattern, outline, params);
  // Only venn.ts's circle-centered layout can produce negative coordinates
  // (see normalizeToOrigin below); matrix.ts reserves its own fixed,
  // always-non-negative margin for axis labels (AXIS_MARGIN_X/Y) that must
  // stay intact, and pyramid/logicTree's cursor-based placement already
  // starts at (0, 0), so normalizing them here would be a no-op at best.
  return pattern === "venn" ? normalizeToOrigin(nodes) : nodes;
}

function rawLayoutFor(pattern: StructuredBlock["pattern"], outline: OutlineNode[], params: Record<string, unknown>): LayoutNode[] {
  switch (pattern) {
    case "pyramid":
      return layoutPyramid(outline);
    case "logicTree":
      return layoutLogicTree(outline);
    case "matrix":
      return layoutMatrix(outline);
    case "venn":
      return layoutVenn(outline, vennSetCount(params));
    default:
      return [];
  }
}

// Every caller treats a LayoutNode's (x, y) as an offset added to the block's
// placement origin (originOfBlock below), which assumes the layout's own
// minimum x/y is 0 - true for pyramid/logicTree/matrix's cursor-based
// placement, but not for venn.ts, whose circle layout is centered on (0, 0)
// and so spans negative coordinates. Shifting every node so the layout's own
// bounding box starts at (0, 0) keeps that assumption true for any pattern,
// instead of each pattern having to know about it.
function normalizeToOrigin(nodes: LayoutNode[]): LayoutNode[] {
  if (nodes.length === 0) return nodes;
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  if (minX === 0 && minY === 0) return nodes;
  return nodes.map((n) => ({ ...n, x: n.x - minX, y: n.y - minY }));
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

function appendShapeToDocument(doc: Document, shape: Shape): Pick<Document, "shapes" | "layers"> {
  return {
    shapes: { ...doc.shapes, [shape.id]: shape },
    layers: doc.layers.map((layer) =>
      layer.id === DEFAULT_LAYER_ID ? { ...layer, shapeIds: [...layer.shapeIds, shape.id] } : layer,
    ),
  };
}

// Position offset for a newly-added node's shape, relative to a reference
// shape (the parent, for a new child; the preceding sibling, for a new
// sibling). Direction depends on the pattern's layout axis (doc/spec.md §6.3).
function newNodeOffset(pattern: StructuredBlock["pattern"], relation: "child" | "sibling"): { x: number; y: number } {
  const down = pattern !== "logicTree";
  if (relation === "child") return down ? { x: 0, y: 100 } : { x: 220, y: 0 };
  return down ? { x: 220, y: 0 } : { x: 0, y: 80 };
}

function buildNodeShape(
  doc: Document,
  block: StructuredBlock,
  newNode: OutlineNode,
  referenceNodeId: string | undefined,
  relation: "child" | "sibling",
): TextShape {
  const referenceShape = referenceNodeId ? findShapeForNode(doc, block, referenceNodeId) : undefined;
  const offset = newNodeOffset(block.pattern, relation);
  const position = referenceShape
    ? { x: referenceShape.x + offset.x, y: referenceShape.y + offset.y }
    : { x: 40, y: 40 };

  return {
    id: uuidv4(),
    type: "text",
    x: position.x,
    y: position.y,
    width: referenceShape?.width ?? 160,
    height: referenceShape?.height ?? 60,
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

export function addFirstOutlineNode(doc: Document, blockId: string): Document {
  const block = findBlock(doc, blockId);
  if (!block || block.outline.length > 0) return doc;
  const newNode: OutlineNode = { id: uuidv4(), text: "", children: [] };

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
  const newNode: OutlineNode = { id: uuidv4(), text: "", children: [] };
  const newOutline = updateChildren(block.outline, parentNodeId, (children) => [...children, newNode]);

  if (isFullyRelayoutedPattern(block.pattern)) {
    return regenerateBlockShapes(doc, block, newOutline);
  }

  const shape = buildNodeShape(doc, block, newNode, parentNodeId, "child");
  const { shapes, layers } = appendShapeToDocument(doc, shape);
  return withBlock({ ...doc, shapes, layers }, blockId, (b) => ({
    ...b,
    outline: newOutline,
    generatedShapeIds: [...b.generatedShapeIds, shape.id],
  }));
}

export function addOutlineSibling(doc: Document, blockId: string, afterNodeId: string): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  const loc = getSiblingsAndIndex(block.outline, afterNodeId);
  if (!loc) return doc;

  const newNode: OutlineNode = { id: uuidv4(), text: "", children: [] };
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
  return withBlock({ ...doc, shapes, layers }, blockId, (b) => ({
    ...b,
    outline: newOutline,
    generatedShapeIds: [...b.generatedShapeIds, shape.id],
  }));
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

  return withBlock({ ...doc, shapes, layers }, blockId, (b) => ({
    ...b,
    outline: newOutline,
    generatedShapeIds: b.generatedShapeIds.filter((id) => !removedShapeIds.includes(id)),
  }));
}

export function updateOutlineNodeText(doc: Document, blockId: string, nodeId: string, text: string): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  const newOutline = mapOutline(block.outline, (node) => (node.id === nodeId ? { ...node, text } : node));

  // Venn only: a text edit can change which set-combination an element
  // belongs to, so its shape may need to move, split, or merge with another -
  // matrix/pyramid/logicTree positions never depend on text (doc/spec.md
  // §6.2.2).
  if (block.pattern === "venn") {
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

  if (owningBlock.pattern === "venn") {
    return regenerateBlockShapes(doc, owningBlock, outline);
  }

  const shapes = { ...doc.shapes, [shapeId]: { ...shape, content } };
  return withBlock({ ...doc, shapes }, owningBlock.id, (b) => ({ ...b, outline }));
}

// Matrix axis labels aren't tied to outline nodes (doc/spec.md §6.2.1), so
// they're tracked via params._axisShapeIds instead of templateNodeIds; every
// call discards and regenerates them (cheap - at most 2 shapes).
export function updateMatrixAxisLabels(doc: Document, blockId: string, axisParams: MatrixAxisParams): Document {
  const block = findBlock(doc, blockId);
  if (!block || block.pattern !== "matrix") return doc;

  const shapes = { ...doc.shapes };
  const oldIds = (block.params._axisShapeIds as ShapeId[] | undefined) ?? [];
  for (const id of oldIds) delete shapes[id];

  const mergedParams = { ...block.params, ...axisParams };
  const labels = layoutMatrixAxisLabels(mergedParams);
  let origin = originOfBlock(doc, block);

  // label.x/y are deliberately negative (outside the grid, to its
  // left/above). Clamping just the label's own absolute position to >= 0
  // isn't enough on its own - a block placed near the canvas edge (the
  // default placement is (40, 40), well within the axis labels' own
  // 176x44 reach) would pull the label so far right/down that it overlaps
  // the grid instead of sitting outside it. So instead, if the grid doesn't
  // currently have enough clearance, shift every shape the block has
  // generated so it does - this only ever grows the clearance, and once
  // grown it stays (origin is derived from the shapes' own position), so
  // repeated calls don't keep shifting it further.
  const neededMinX = Math.max(0, -Math.min(0, ...labels.map((l) => l.x)));
  const neededMinY = Math.max(0, -Math.min(0, ...labels.map((l) => l.y)));
  const dx = Math.max(0, neededMinX - origin.x);
  const dy = Math.max(0, neededMinY - origin.y);
  if (dx > 0 || dy > 0) {
    for (const id of block.generatedShapeIds) {
      const s = shapes[id];
      if (s) shapes[id] = { ...s, x: s.x + dx, y: s.y + dy };
    }
    origin = { x: origin.x + dx, y: origin.y + dy };
  }

  const newIds: ShapeId[] = [];
  let zIndex = Object.keys(shapes).length;
  for (const label of labels) {
    const shape: TextShape = {
      id: uuidv4(),
      type: "text",
      x: origin.x + label.x,
      y: origin.y + label.y,
      width: label.width,
      height: label.height,
      rotation: 0,
      style: defaultShapeStyle(doc.colorThemeId),
      zIndex: zIndex++,
      content: label.text,
      align: "center",
    };
    shapes[shape.id] = shape;
    newIds.push(shape.id);
  }

  const oldIdSet = new Set(oldIds);
  const layers = doc.layers.map((layer) =>
    layer.id === DEFAULT_LAYER_ID
      ? { ...layer, shapeIds: [...layer.shapeIds.filter((id) => !oldIdSet.has(id)), ...newIds] }
      : layer,
  );

  return withBlock({ ...doc, shapes, layers }, blockId, (b) => ({
    ...b,
    params: { ...mergedParams, _axisShapeIds: newIds },
    generatedShapeIds: [...b.generatedShapeIds.filter((id) => !oldIdSet.has(id)), ...newIds],
  }));
}

// Shrinking setCount drops any roots beyond the new count (and their shapes) -
// otherwise a set the UI no longer lets you edit would linger as an orphan.
export function updateVennSetCount(doc: Document, blockId: string, setCount: number): Document {
  const block = findBlock(doc, blockId);
  if (!block || block.pattern !== "venn") return doc;
  const clamped = Math.max(VENN_MIN_SETS, Math.min(VENN_MAX_SETS, setCount));
  const newOutline = block.outline.slice(0, clamped);
  const updatedBlock: StructuredBlock = { ...block, params: { ...block.params, setCount: clamped } };
  return regenerateBlockShapes(doc, updatedBlock, newOutline);
}

// Matrix axis labels (params._axisShapeIds) sit outside the grid, deliberately
// at negative offsets from it (layoutMatrixAxisLabels), and are excluded here
// so they can never pull the computed origin - and so every later
// regeneration - further negative themselves (see updateMatrixAxisLabels's
// own clamp for how their absolute position is kept on-canvas).
function originOfBlock(doc: Document, block: StructuredBlock): { x: number; y: number } {
  const axisShapeIds = new Set((block.params._axisShapeIds as ShapeId[] | undefined) ?? []);
  const shapes = block.generatedShapeIds
    .filter((id) => !axisShapeIds.has(id))
    .map((id) => doc.shapes[id])
    .filter((s): s is Shape => Boolean(s));
  if (shapes.length === 0) return { x: 40, y: 40 };
  return { x: Math.min(...shapes.map((s) => s.x)), y: Math.min(...shapes.map((s) => s.y)) };
}

// Recomputes every generated shape's position from a fresh layout of
// `newOutline`, keeping each shape's own id (and any style customization) by
// matching on templateNodeIds. Used after restructuring (indent/outdent/move)
// where the tree shape changed but no nodes were added or removed.
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

export function indentOutlineNode(doc: Document, blockId: string, nodeId: string): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  const loc = getSiblingsAndIndex(block.outline, nodeId);
  if (!loc || loc.index === 0) return doc; // no preceding sibling to become the new parent

  const node = loc.siblings[loc.index];
  const newParentId = loc.siblings[loc.index - 1].id;

  let newOutline = updateChildren(block.outline, loc.parentId, (children) => children.filter((_, i) => i !== loc.index));
  newOutline = updateChildren(newOutline, newParentId, (children) => [...children, node]);

  return relayoutBlock(doc, block, newOutline);
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

  return relayoutBlock(doc, block, newOutline);
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

  return relayoutBlock(doc, block, newOutline);
}

// Bulk replace (paste import, doc/spec.md §6.1): discards every shape this
// block previously generated and lays out fresh ones for the new outline.
export function replaceOutline(doc: Document, blockId: string, newOutline: OutlineNode[]): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  return regenerateBlockShapes(doc, block, newOutline);
}

// Discards every shape `block` previously generated (by nodeId) and lays out
// fresh ones for `newOutline`, using `block.params` for layout (so callers
// that also change params, e.g. updateVennSetCount, should pass a `block`
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
      rotation: 0,
      zIndex: zIndex++,
      templateNodeIds: layoutNode.nodeIds,
    };
    const shape: Shape =
      layoutNode.kind === "ellipse"
        ? { ...base, type: "ellipse", style: outlineStyle(doc.colorThemeId) }
        : layoutNode.kind === "rect"
          ? { ...base, type: "rect", style: outlineStyle(doc.colorThemeId) }
          : layoutNode.kind === "label"
            ? { ...base, type: "text", style: labelStyle(doc.colorThemeId), content: layoutNode.text, align: "center" }
            : { ...base, type: "text", style: defaultShapeStyle(doc.colorThemeId), content: layoutNode.text, align: "center" };
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
