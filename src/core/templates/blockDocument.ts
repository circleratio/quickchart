import type { Document, StructuredBlock } from "../model/document";
import { DEFAULT_LAYER_ID } from "../model/document";
import type { Shape, ShapeId } from "../model/shape";

// Document-level helpers for one structured block: finding/replacing it,
// adding a generated shape, and locating its shapes on the canvas. Shared by
// materialize.ts, treePlacement.ts and sync.ts.

export function findBlock(doc: Document, blockId: string): StructuredBlock | undefined {
  return doc.structuredBlocks.find((b) => b.id === blockId);
}

export function withBlock(doc: Document, blockId: string, updater: (block: StructuredBlock) => StructuredBlock): Document {
  return {
    ...doc,
    structuredBlocks: doc.structuredBlocks.map((b) => (b.id === blockId ? updater(b) : b)),
  };
}


export function appendShapeToDocument(doc: Document, shape: Shape): Pick<Document, "shapes" | "layers"> {
  return {
    shapes: { ...doc.shapes, [shape.id]: shape },
    layers: doc.layers.map((layer) =>
      layer.id === DEFAULT_LAYER_ID ? { ...layer, shapeIds: [...layer.shapeIds, shape.id] } : layer,
    ),
  };
}

export function findShapeForNode(doc: Document, block: StructuredBlock, nodeId: string): Shape | undefined {
  for (const shapeId of block.generatedShapeIds) {
    const shape = doc.shapes[shapeId];
    if (shape?.templateNodeIds?.includes(nodeId)) return shape;
  }
  return undefined;
}

// params._axisShapeIds only exists on matrix blocks saved before the
// redesign (doc/spec.md §6.2.1), whose axis labels were separately-placed
// shapes outside the grid; they're excluded so the first regenerate of such a
// block (which drops them - they're in generatedShapeIds too - and lays the
// labels out with the rest) keeps the grid anchored where it was.
export function originOfBlock(doc: Document, block: StructuredBlock): { x: number; y: number } {
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
