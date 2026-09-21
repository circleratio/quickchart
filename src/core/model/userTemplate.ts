import { v4 as uuidv4 } from "uuid";
import type { Point, Shape, ShapeId } from "./shape";

// Reusable across projects (doc/spec.md §3.4), stored in the app config
// directory rather than the project file (§6.4).
export interface UserTemplate {
  id: string;
  name: string;
  shapes: Shape[]; // relative coordinates - bounding box top-left is (0, 0)
  createdAt: string; // ISO 8601
}

// Normalizes a set of shapes to relative coordinates for storing as a
// reusable UserTemplate.
export function normalizeShapesForTemplate(shapes: Shape[]): Shape[] {
  if (shapes.length === 0) return [];
  const minX = Math.min(...shapes.map((s) => s.x));
  const minY = Math.min(...shapes.map((s) => s.y));
  return shapes.map((s) => ({ ...s, x: s.x - minX, y: s.y - minY }));
}

// Instantiates a template's normalized shapes at an absolute drop position,
// with fresh ids and no structured-template linkage (doc/spec.md §6.4: plain
// shapes, not tied to any StructuredBlock). Shapes that shared a groupId in
// the template keep sharing a (new) groupId with each other, same as
// documentStore's duplicate/paste.
export function instantiateTemplate(template: UserTemplate, dropPoint: Point, startZIndex: number): Shape[] {
  const groupIdMap = new Map<string, string>();
  return template.shapes.map((shape, i) => {
    let newGroupId: string | undefined;
    if (shape.groupId) {
      if (!groupIdMap.has(shape.groupId)) groupIdMap.set(shape.groupId, uuidv4());
      newGroupId = groupIdMap.get(shape.groupId);
    }
    return {
      ...shape,
      id: uuidv4() as ShapeId,
      x: shape.x + dropPoint.x,
      y: shape.y + dropPoint.y,
      zIndex: startZIndex + i,
      groupId: newGroupId,
      templateNodeIds: undefined,
    };
  });
}
