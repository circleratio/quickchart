import { describe, expect, it } from "vitest";
import { computeAlignmentGuides, unionBox } from "./guides";

// doc/plan.md フェーズ18/§13: 整列ガイド線(doc/spec.md §5.3)。
describe("computeAlignmentGuides", () => {
  const other = { x: 100, y: 200, width: 100, height: 50 }; // x: 100/150/200, y: 200/225/250

  it("snaps the left edge to another shape's left edge within the threshold", () => {
    const result = computeAlignmentGuides({ x: 103, y: 0, width: 40, height: 40 }, [other], 6);
    expect(result.snappedX).toBe(true);
    expect(result.dx).toBe(-3);
    expect(result.snappedY).toBe(false);
    expect(result.dy).toBe(0);
    expect(result.lines).toEqual([{ axis: "x", position: 100, from: 0, to: 250 }]);
  });

  it("snaps centers", () => {
    // moving refs x: 128/148/168 -> center 148 is 2 from 150; y: 222/227/232 -> center 227 is 2 from 225
    const result = computeAlignmentGuides({ x: 128, y: 222, width: 40, height: 10 }, [other], 6);
    expect(result.dx).toBe(2);
    expect(result.dy).toBe(-2);
    expect(result.lines.map((l) => [l.axis, l.position])).toEqual([
      ["x", 150],
      ["y", 225],
    ]);
  });

  it("snaps the moving right edge to another shape's left edge", () => {
    const result = computeAlignmentGuides({ x: 55, y: 0, width: 40, height: 40 }, [other], 6);
    expect(result.dx).toBe(5);
  });

  it("does not snap beyond the threshold", () => {
    // moving refs x: 107/112/117 -> nearest is 100, 7 away
    const result = computeAlignmentGuides({ x: 107, y: 0, width: 10, height: 40 }, [other], 6);
    expect(result.snappedX).toBe(false);
    expect(result.dx).toBe(0);
    expect(result.lines).toEqual([]);
  });

  it("picks the closest candidate when several are within the threshold", () => {
    const near = { x: 102, y: 500, width: 10, height: 10 };
    const result = computeAlignmentGuides({ x: 103, y: 0, width: 40, height: 40 }, [other, near], 6);
    expect(result.dx).toBe(-1);
    expect(result.lines[0].position).toBe(102);
  });

  it("extends the guide over every shape aligned at that position", () => {
    const below = { x: 100, y: 400, width: 30, height: 30 };
    const result = computeAlignmentGuides({ x: 101, y: 0, width: 40, height: 40 }, [other, below], 6);
    expect(result.lines).toEqual([{ axis: "x", position: 100, from: 0, to: 430 }]);
  });

  it("handles boxes with negative width/height (lines drawn up/left)", () => {
    const line = { x: 200, y: 300, width: -100, height: -50 }; // spans x 100..200, y 250..300
    const result = computeAlignmentGuides({ x: 97, y: 0, width: 40, height: 40 }, [line], 6);
    expect(result.dx).toBe(3);
  });
});

describe("unionBox", () => {
  it("returns the bounding box of all boxes", () => {
    expect(
      unionBox([
        { x: 0, y: 10, width: 20, height: 20 },
        { x: 50, y: 0, width: 10, height: 5 },
      ]),
    ).toEqual({ x: 0, y: 0, width: 60, height: 30 });
  });

  it("returns null for no boxes", () => {
    expect(unionBox([])).toBeNull();
  });
});
