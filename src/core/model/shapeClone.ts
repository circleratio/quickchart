import { v4 as uuidv4 } from "uuid";
import type { Document } from "./document";
import { DEFAULT_LAYER_ID } from "./document";
import type { ConnectorShape, Shape, ShapeId } from "./shape";
import { resolveEndpoint } from "../layout/connector";

// Offset applied to every duplicated/pasted shape so the copy doesn't sit
// exactly on top of its original (doc/spec.md §4.1).
export const CLONE_OFFSET = 20;

function isConnector(shape: Shape): shape is ConnectorShape {
  return shape.type === "connector" || shape.type === "arrow";
}

// Normalizes shapes about to be copied/duplicated (doc/spec.md §4.1): a
// connector endpoint attached to a shape that is NOT part of `shapes` is
// detached and frozen at its current absolute position, since that target
// won't exist next to the copy (e.g. when pasted into another tab).
// Endpoints attached to shapes inside `shapes` are left as-is so
// cloneShapesInto can re-point them at the copies. Needs `sourceShapes` (the
// document the shapes currently live in) to resolve the detached positions.
export function detachExternalConnections(shapes: Shape[], sourceShapes: Record<ShapeId, Shape>): Shape[] {
  const includedIds = new Set(shapes.map((shape) => shape.id));
  return shapes.map((shape) => {
    if (!isConnector(shape)) return shape;
    const fromExternal = shape.fromShapeId !== undefined && !includedIds.has(shape.fromShapeId);
    const toExternal = shape.toShapeId !== undefined && !includedIds.has(shape.toShapeId);
    if (!fromExternal && !toExternal) return shape;

    const points = [resolveEndpoint(shape, "from", sourceShapes), resolveEndpoint(shape, "to", sourceShapes)];
    const detached: ConnectorShape = { ...shape, points };
    if (fromExternal) {
      detached.fromShapeId = undefined;
      detached.fromAnchor = undefined;
    }
    if (toExternal) {
      detached.toShapeId = undefined;
      detached.toAnchor = undefined;
    }
    return detached;
  });
}

// Mutates `draft.shapes`/`draft.layers` in place (Immer draft) to add clones of
// `shapesToClone`, offset by CLONE_OFFSET. Two passes: the first assigns every
// new id up front so the second can re-point connectors at the copies of
// shapes cloned in the same batch. Shapes that shared a groupId keep sharing a
// (new) groupId with each other. Clones are always plain shapes, never linked
// back to a structured template's outline (templateNodeIds dropped - doc/
// requirement.md §4.7). Returns the new shapes' ids.
export function cloneShapesInto(draft: Document, shapesToClone: Shape[]): ShapeId[] {
  const idMap = new Map<ShapeId, ShapeId>();
  for (const original of shapesToClone) idMap.set(original.id, uuidv4());

  const groupIdMap = new Map<string, string>();
  const defaultLayer = draft.layers.find((layer) => layer.id === DEFAULT_LAYER_ID);
  let nextZIndex = Object.keys(draft.shapes).length;
  const newIds: ShapeId[] = [];

  for (const original of shapesToClone) {
    const newId = idMap.get(original.id)!;
    let newGroupId: string | undefined;
    if (original.groupId) {
      if (!groupIdMap.has(original.groupId)) groupIdMap.set(original.groupId, uuidv4());
      newGroupId = groupIdMap.get(original.groupId);
    }
    const clone = {
      ...original,
      id: newId,
      x: original.x + CLONE_OFFSET,
      y: original.y + CLONE_OFFSET,
      groupId: newGroupId,
      zIndex: nextZIndex++,
      templateNodeIds: undefined,
    } as Shape;
    if (isConnector(clone)) {
      // Connector points are absolute canvas coordinates (unlike a polygon's
      // box-relative ones), so they need the same offset as x/y.
      clone.points = clone.points.map((point) => ({ x: point.x + CLONE_OFFSET, y: point.y + CLONE_OFFSET }));
      if (clone.fromShapeId !== undefined) clone.fromShapeId = idMap.get(clone.fromShapeId) ?? clone.fromShapeId;
      if (clone.toShapeId !== undefined) clone.toShapeId = idMap.get(clone.toShapeId) ?? clone.toShapeId;
    }
    draft.shapes[newId] = clone;
    newIds.push(newId);
    defaultLayer?.shapeIds.push(newId);
  }

  return newIds;
}
