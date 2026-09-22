import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ShapeRenderer } from "./ShapeRenderer";
import type { PolygonShape, TextShape } from "../../core/model/shape";

function textShape(overrides: Partial<TextShape> = {}): TextShape {
  return {
    id: "s1",
    type: "text",
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    rotation: 0,
    style: { fill: "#095a79", stroke: "#095a79", strokeWidth: 2, textColor: "#ffffff" },
    zIndex: 0,
    content: "列見出し",
    align: "center",
    ...overrides,
  };
}

describe("ShapeRenderer (text shapes)", () => {
  // Reproduces the reported bug: bulletMatrix's column headers (bulletMatrix.ts)
  // are template-generated shapes with no linked outline node (their content
  // comes from params.columnHeaders, not the outline), so regenerateBlockShapes
  // (sync.ts) gives them `templateNodeIds: []` - same as every other template
  // shape, just with zero ids in it. Checking `.length` instead of `!== undefined`
  // treated that the same as a plain free-text shape and forced it transparent,
  // making the header invisible even though its stored style.fill was correct.
  it("renders a template shape's own fill even when templateNodeIds is empty (not undefined)", () => {
    const shape = textShape({ templateNodeIds: [] });
    const { container } = render(
      <svg>
        <ShapeRenderer shape={shape} selected={false} onPointerDown={() => {}} />
      </svg>,
    );
    expect(container.querySelector("rect")).toHaveAttribute("fill", "#095a79");
  });

  it("renders free text (no templateNodeIds at all) as transparent, not the theme fill", () => {
    const shape = textShape({ templateNodeIds: undefined });
    const { container } = render(
      <svg>
        <ShapeRenderer shape={shape} selected={false} onPointerDown={() => {}} />
      </svg>,
    );
    expect(container.querySelector("rect")).toHaveAttribute("fill", "transparent");
  });

  it("still renders a shape with real templateNodeIds using its own fill (unaffected by the fix)", () => {
    const shape = textShape({ templateNodeIds: ["node-1"] });
    const { container } = render(
      <svg>
        <ShapeRenderer shape={shape} selected={false} onPointerDown={() => {}} />
      </svg>,
    );
    expect(container.querySelector("rect")).toHaveAttribute("fill", "#095a79");
  });
});

describe("ShapeRenderer (polygon shapes)", () => {
  it("resolves a polygon's fraction points against its own bounding box", () => {
    const shape: PolygonShape = {
      id: "p1",
      type: "polygon",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      rotation: 0,
      style: { fill: "#095a79", stroke: "#095a79", strokeWidth: 2 },
      zIndex: 0,
      points: [
        { x: 0.5, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    };
    const { container } = render(
      <svg>
        <ShapeRenderer shape={shape} selected={false} onPointerDown={() => {}} />
      </svg>,
    );
    expect(container.querySelector("polygon")).toHaveAttribute("points", "60,20 110,70 10,70");
  });
});
