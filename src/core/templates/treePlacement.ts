import { v4 as uuidv4 } from "uuid";
import type { Document, OutlineNode, StructuredBlock } from "../model/document";
import { DEFAULT_LAYER_ID } from "../model/document";
import type { LineShape, Shape, ShapeId, TextShape } from "../model/shape";
import { defaultShapeStyle, treeConnectorStyle } from "../model/style";
import { findBlock, findShapeForNode, withBlock } from "./blockDocument";
import { patternOf } from "./registry";

// The tree patterns' (pyramid/logicTree, PatternDefinition.tree) own
// placement: adding a node places just its shape next to a reference shape
// instead of regenerating the block, and parent-child connector lines are
// redrawn from the shapes' actual positions after every structural edit.

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
// (buildNodeShape below) doesn't necessarily match (and which manual
// repositioning on the canvas would diverge from anyway). Called after every
// structural edit (add/delete/indent/outdent/move/bulk-import - see each
// call site in sync.ts); a no-op for any other pattern. Old connectors are
// tracked via params._treeConnectorShapeIds (same "untracked shape, own
// params slot" convention as matrix's _axisShapeIds) and always fully
// discarded and redrawn rather than diffed, since a single child add/remove
// can change where the bus needs to start/end.
export function regenerateTreeConnectors(doc: Document, blockId: string): Document {
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

const DEFAULT_NODE_WIDTH = 160;

const DEFAULT_NODE_HEIGHT = 60;

// Visual gap for incremental placement's offsets below - matches
// pyramid.ts's/logicTree.ts's own layoutTree GAP, so a tree built via the
// primary node-by-node UI reads with the same rhythm as one built via bulk
// import (which goes through that GAP directly - see materialize.ts's
// layoutFor).
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

export function buildNodeShape(
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
