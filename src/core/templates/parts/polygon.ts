import type { Point } from "../../model/shape";
import type { LayoutNodeProps } from "../layoutNode";

// Triangles as vertex fractions of their own bounding box (see shape.ts's
// PolygonShape) - connector arrows between steps/columns and milestone
// markers.
export const RIGHT_TRIANGLE_POINTS: Point[] = [
  { x: 0, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 0.5 },
];
export const DOWN_TRIANGLE_POINTS: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0.5, y: 1 },
];

// A polygon given in absolute layout coordinates, converted to what a
// "polygon" LayoutNode expects: its bounding box plus the vertices as
// fractions of that box. Spread into shapeNode/decoration along with the
// polygon's own styling.
export function polygonFromAbsolute(abs: Point[]): Pick<LayoutNodeProps, "x" | "y" | "width" | "height" | "kind" | "points"> {
  const minX = Math.min(...abs.map((p) => p.x));
  const maxX = Math.max(...abs.map((p) => p.x));
  const minY = Math.min(...abs.map((p) => p.y));
  const maxY = Math.max(...abs.map((p) => p.y));
  const width = maxX - minX;
  const height = maxY - minY;
  return {
    x: minX,
    y: minY,
    width,
    height,
    kind: "polygon",
    points: abs.map((p) => ({ x: (p.x - minX) / width, y: (p.y - minY) / height })),
  };
}
