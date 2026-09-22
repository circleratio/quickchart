import { describe, expect, it } from "vitest";
import { buildSvgDocument } from "./svgExport";
import { createEmptyDocument } from "../model/document";
import type { Document } from "../model/document";
import { defaultShapeStyle } from "../model/style";
import type { Shape } from "../model/shape";

function withShapes(shapes: Shape[]): Document {
  const doc = createEmptyDocument();
  const shapeMap = Object.fromEntries(shapes.map((s) => [s.id, s]));
  return { ...doc, shapes: shapeMap, layers: [{ ...doc.layers[0], shapeIds: shapes.map((s) => s.id) }] };
}

describe("buildSvgDocument", () => {
  it("returns a minimal valid svg for an empty document", () => {
    const svg = buildSvgDocument(createEmptyDocument());
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("includes a rect element for a rect shape", () => {
    const doc = withShapes([
      {
        id: "r1",
        type: "rect",
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        rotation: 0,
        style: defaultShapeStyle(),
        zIndex: 0,
      },
    ]);
    const svg = buildSvgDocument(doc);
    expect(svg).toContain('<rect x="10" y="20" width="100" height="50"');
  });

  it("resolves a polygon shape's fraction points to absolute coordinates", () => {
    const doc = withShapes([
      {
        id: "p1",
        type: "polygon",
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        rotation: 0,
        style: defaultShapeStyle(),
        zIndex: 0,
        points: [
          { x: 0.5, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
      },
    ]);
    const svg = buildSvgDocument(doc);
    expect(svg).toContain('<polygon points="60,20 110,70 10,70"');
  });

  it("escapes text content and shows Japanese text as-is (no mangling)", () => {
    const doc = withShapes([
      {
        id: "t1",
        type: "text",
        x: 0,
        y: 0,
        width: 100,
        height: 30,
        rotation: 0,
        style: defaultShapeStyle(),
        zIndex: 0,
        content: '<script>alert("x")</script>コンサル',
        align: "left",
      },
    ]);
    const svg = buildSvgDocument(doc);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("コンサル");
  });

  it("resolves a connector between two shapes to a line between their anchors", () => {
    const from: Shape = {
      id: "a",
      type: "rect",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      style: defaultShapeStyle(),
      zIndex: 0,
    };
    const to: Shape = {
      id: "b",
      type: "rect",
      x: 300,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      style: defaultShapeStyle(),
      zIndex: 1,
    };
    const connector: Shape = {
      id: "c",
      type: "connector",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rotation: 0,
      style: defaultShapeStyle(),
      zIndex: 2,
      fromShapeId: "a",
      fromAnchor: "right",
      toShapeId: "b",
      toAnchor: "left",
      points: [],
    };
    const svg = buildSvgDocument(withShapes([from, to, connector]));
    expect(svg).toContain('x1="100" y1="50" x2="300" y2="50"');
  });

  it("computes a viewBox that covers all shapes with padding", () => {
    const doc = withShapes([
      { id: "a", type: "rect", x: 0, y: 0, width: 50, height: 50, rotation: 0, style: defaultShapeStyle(), zIndex: 0 },
      {
        id: "b",
        type: "rect",
        x: 200,
        y: 100,
        width: 50,
        height: 50,
        rotation: 0,
        style: defaultShapeStyle(),
        zIndex: 1,
      },
    ]);
    const svg = buildSvgDocument(doc, 10);
    expect(svg).toContain('viewBox="-10 -10 270 170"');
  });
});
