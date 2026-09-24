import { v4 as uuidv4 } from "uuid";
import type { Document, OutlineNode, StructuredBlock } from "../model/document";
import type { ShapeId } from "../model/shape";
import { appendShapeToDocument, findBlock, withBlock } from "./blockDocument";
import { regenerateBlockShapes, relayoutBlock } from "./materialize";
import {
  collectSubtreeIds,
  findNode,
  getSiblingsAndIndex,
  mapOutline,
  removeNodeFromTree,
  updateChildren,
} from "./outlineTree";
import { emptyNode } from "./patternDefinition";
import type { RawParams } from "./patternDefinition";
import { patternOf } from "./registry";
import { buildNodeShape, regenerateTreeConnectors } from "./treePlacement";

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

// Indent/outdent/move: the tree patterns move their existing shapes in
// place, every other pattern regenerates (see PatternDefinition.tree), then
// the tree patterns' connector lines are resynced - relayoutBlock
// repositions every ordinary node shape but, having no templateNodeIds,
// never touches connector shapes, which would otherwise keep pointing at
// their pre-restructure positions.
function relayoutOrRegenerate(doc: Document, block: StructuredBlock, newOutline: OutlineNode[]): Document {
  const next = patternOf(block.pattern).tree ? relayoutBlock(doc, block, newOutline) : regenerateBlockShapes(doc, block, newOutline);
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
