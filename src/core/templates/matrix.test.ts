import { describe, expect, it } from "vitest";
import { layoutMatrix, layoutMatrixAxisLabels, MATRIX_MAX_ROOTS } from "./matrix";
import type { OutlineNode } from "../model/document";

function node(id: string, text: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text, children };
}

describe("layoutMatrix", () => {
  it("returns an empty layout for an empty outline", () => {
    expect(layoutMatrix([])).toEqual([]);
  });

  it("places 4 quadrants in natural reading order: top-left, top-right, bottom-left, bottom-right", () => {
    const outline = [node("q1", "Q1"), node("q2", "Q2"), node("q3", "Q3"), node("q4", "Q4")];
    const layout = layoutMatrix(outline);
    const q1 = layout.find((l) => l.nodeIds.includes("q1"))!;
    const q2 = layout.find((l) => l.nodeIds.includes("q2"))!;
    const q3 = layout.find((l) => l.nodeIds.includes("q3"))!;
    const q4 = layout.find((l) => l.nodeIds.includes("q4"))!;

    expect(q1.x).toBeLessThan(q2.x); // q1 left of q2
    expect(q1.y).toBe(q2.y); // same row
    expect(q1.y).toBeLessThan(q3.y); // q1 above q3
    expect(q1.x).toBe(q3.x); // same column
    expect(q4.x).toBeGreaterThan(q3.x);
    expect(q4.y).toBeGreaterThan(q2.y);
  });

  it("ignores a 5th+ root defensively (UI is expected to prevent this, but data may still have it)", () => {
    const outline = [node("q1", "Q1"), node("q2", "Q2"), node("q3", "Q3"), node("q4", "Q4"), node("q5", "Q5")];
    const layout = layoutMatrix(outline);
    expect(layout.some((l) => l.nodeIds.includes("q5"))).toBe(false);
    expect(MATRIX_MAX_ROOTS).toBe(4);
  });

  it("stacks items within a quadrant without overlapping", () => {
    const outline = [node("q1", "Q1", [node("a", "a"), node("b", "b"), node("c", "c")])];
    const layout = layoutMatrix(outline);
    const items = layout.filter((l) => l.depth === 1);
    expect(items).toHaveLength(3);
    const ys = items.map((i) => i.y);
    expect(new Set(ys).size).toBe(3); // all distinct
    expect(items.every((i) => i.x === items[0].x)).toBe(true); // same column
  });

  it("handles an empty quadrant (no items) without error", () => {
    const outline = [node("q1", "Q1"), node("q2", "Q2", [node("a", "a")])];
    const layout = layoutMatrix(outline);
    // Each quadrant is 2 shapes at depth 0: a background square (kind: "rect")
    // and its title label.
    expect(layout.filter((l) => l.depth === 0 && l.kind === "rect")).toHaveLength(2);
    expect(layout.filter((l) => l.depth === 0 && l.kind !== "rect")).toHaveLength(2);
    expect(layout.filter((l) => l.depth === 1)).toHaveLength(1);
  });

  // Reproduces the reported bug: each quadrant only ever generated its title
  // label (a thin bar), never a background shape, so quadrants didn't read as
  // squares at all.
  it("gives each quadrant a square background shape sized QUADRANT_SIZE x QUADRANT_SIZE", () => {
    const outline = [node("q1", "Q1"), node("q2", "Q2")];
    const layout = layoutMatrix(outline);
    const backgrounds = layout.filter((l) => l.kind === "rect");
    expect(backgrounds).toHaveLength(2);
    for (const bg of backgrounds) {
      expect(bg.width).toBe(bg.height);
    }
  });
});

describe("layoutMatrixAxisLabels", () => {
  it("returns nothing when no axis labels are set", () => {
    expect(layoutMatrixAxisLabels({})).toEqual([]);
  });

  it("returns an entry only for axis labels with non-blank text", () => {
    const result = layoutMatrixAxisLabels({ axisXLabel: "市場シェア", axisYLabel: "  " });
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("axisXLabel");
    expect(result[0].text).toBe("市場シェア");
  });
});
