import { v4 as uuidv4 } from "uuid";
import type { ShapeStyle } from "./style";
import { defaultShapeStyle } from "./style";

export type ShapeId = string;

export type ShapeType = "rect" | "ellipse" | "line" | "arrow" | "connector" | "text" | "polygon";

export interface Point {
  x: number;
  y: number;
}

export interface ShapeBase {
  id: ShapeId;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  style: ShapeStyle;
  groupId?: string;
  zIndex: number;
  // Set when this shape was generated from a structured template (Phase 7+).
  templateNodeIds?: string[];
}

export interface RectShape extends ShapeBase {
  type: "rect";
  cornerRadius?: number;
}

export interface EllipseShape extends ShapeBase {
  type: "ellipse";
}

// An arbitrary closed polygon (pyramidChart's pyramid-slice bands - see
// templates/pyramidChart.ts). `points` are fractions (0..1) of the shape's own
// x/y/width/height bounding box rather than absolute coordinates, so the usual
// generic move/resize handling (computeAnchoredResize in layout/resize.ts,
// which only ever touches x/y/width/height) scales the polygon along with its
// box for free instead of needing polygon-specific resize logic.
export interface PolygonShape extends ShapeBase {
  type: "polygon";
  points: Point[];
}

// A plain line's two endpoints are (x, y) and (x + width, y + height); it has no
// anchors/attachment, unlike ConnectorShape below.
export interface LineShape extends ShapeBase {
  type: "line";
}

export type AnchorPoint = "top" | "right" | "bottom" | "left" | "center";

export interface ConnectorShape extends ShapeBase {
  type: "connector" | "arrow";
  fromShapeId?: ShapeId;
  fromAnchor?: AnchorPoint;
  toShapeId?: ShapeId;
  toAnchor?: AnchorPoint;
  points: Point[];
}

export interface TextShape extends ShapeBase {
  type: "text";
  content: string;
  align: "left" | "center" | "right";
  // Renders this literal prefix (e.g. "• ", "- ") ahead of `content` without
  // it being part of the editable text itself (headingBullets' bullet items;
  // bulletMatrix's title/detail lines, which use different markers for each -
  // see templates/headingBullets.ts and templates/bulletMatrix.ts). Kept
  // separate from `content` so the inline text-edit overlay (Canvas.tsx)
  // shows/saves the raw text only.
  bulletMarker?: string;
}

export type Shape = RectShape | EllipseShape | LineShape | ConnectorShape | TextShape | PolygonShape;

// A patch may set any field valid on any concrete Shape variant, not just the
// fields common to all of them (which is all a naive Partial<Shape> would
// allow, since keyof of a union is the intersection of its members' keys).
// Listed explicitly rather than via `Partial<A & B & ...>`, because
// intersecting these interfaces collapses to `never` (their `type` fields are
// mutually exclusive string literals, so TS treats the intersection as
// uninhabitable). Callers are responsible for only patching fields that make
// sense for the shape's actual runtime type.
export type ShapePatch = Partial<ShapeBase> &
  Partial<Pick<RectShape, "cornerRadius">> &
  Partial<Pick<ConnectorShape, "fromShapeId" | "fromAnchor" | "toShapeId" | "toAnchor" | "points">> &
  Partial<Pick<TextShape, "content" | "align">> &
  Partial<Pick<PolygonShape, "points">>;

export type PlaceableShapeType = "rect" | "ellipse" | "line" | "text";

// UI tool selection: either the pointer/select tool, a shape type to place next
// with a single click, or a connector/arrow tool that draws by dragging from a
// start point/shape to an end point/shape (see Canvas.tsx).
export type Tool = "select" | PlaceableShapeType | "connector" | "arrow";

const DEFAULT_SIZE: Record<PlaceableShapeType, { width: number; height: number }> = {
  rect: { width: 160, height: 100 },
  ellipse: { width: 160, height: 100 },
  line: { width: 160, height: 0 },
  text: { width: 160, height: 40 },
};

// Creates a new shape of the given tool type, centered on `center`.
export function createShape(type: PlaceableShapeType, center: Point, zIndex: number, themeId?: string): Shape {
  const size = DEFAULT_SIZE[type];
  const base = {
    id: uuidv4(),
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
    width: size.width,
    height: size.height,
    rotation: 0,
    style: defaultShapeStyle(themeId),
    zIndex,
  };

  switch (type) {
    case "rect":
      return { ...base, type: "rect" };
    case "ellipse":
      return { ...base, type: "ellipse" };
    case "line":
      return { ...base, type: "line" };
    case "text":
      return { ...base, type: "text", content: "テキスト", align: "left" };
  }
}
