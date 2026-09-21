import { rotateVector } from "./resize";

export interface Point {
  x: number;
  y: number;
}

export interface AnchorBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export type AnchorSide = "top" | "right" | "bottom" | "left" | "center";

const DEG_TO_RAD = Math.PI / 180;

// Absolute canvas position of one of a shape's four anchor points (or its
// center), accounting for the shape's own rotation (see doc/spec.md §5).
export function anchorPosition(shape: AnchorBox, anchor: AnchorSide): Point {
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  let localX = 0;
  let localY = 0;
  switch (anchor) {
    case "top":
      localY = -shape.height / 2;
      break;
    case "bottom":
      localY = shape.height / 2;
      break;
    case "left":
      localX = -shape.width / 2;
      break;
    case "right":
      localX = shape.width / 2;
      break;
    case "center":
      break;
  }
  const [rx, ry] = rotateVector(localX, localY, shape.rotation * DEG_TO_RAD);
  return { x: cx + rx, y: cy + ry };
}

// Picks whichever side of `shape` faces most directly toward `towardPoint`,
// for auto-connecting a connector/arrow endpoint without a manual anchor picker.
export function pickAnchor(shape: AnchorBox, towardPoint: Point): AnchorSide {
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const dx = towardPoint.x - cx;
  const dy = towardPoint.y - cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "bottom" : "top";
}

// Axis-aligned hit test, ignoring rotation - a deliberate MVP simplification for
// picking which shape a connector endpoint should attach to when dropped.
export function isPointInsideBox(box: AnchorBox, point: Point): boolean {
  return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
}
