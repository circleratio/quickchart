import { describe, expect, it } from "vitest";
import { layoutVenn } from "./venn";
import type { OutlineNode } from "../model/document";

function node(id: string, text: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text, children };
}

describe("layoutVenn", () => {
  it("returns an empty layout for an empty outline", () => {
    expect(layoutVenn([], 2)).toEqual([]);
  });

  it("places one shape per set label plus one per distinct element for 2 disjoint sets", () => {
    const outline = [
      node("A", "集合A", [node("a1", "りんご"), node("a2", "ぶどう")]),
      node("B", "集合B", [node("b1", "もも")]),
    ];
    const layout = layoutVenn(outline, 2);
    // 2 circles + 2 set labels + 3 distinct elements = 7 shapes
    expect(layout).toHaveLength(7);
  });

  it("merges an element shared between two sets into a single shape with both nodeIds", () => {
    const outline = [
      node("A", "集合A", [node("a1", "りんご"), node("a2", "みかん")]),
      node("B", "集合B", [node("b1", "みかん"), node("b2", "もも")]),
    ];
    const layout = layoutVenn(outline, 2);
    const shared = layout.find((l) => l.text === "みかん")!;
    expect(shared.nodeIds.sort()).toEqual(["a2", "b1"].sort());
    // 2 circles + 2 labels + りんご + みかん(merged) + もも = 7, not 8
    expect(layout).toHaveLength(7);
  });

  it("keeps duplicate elements within the same set as separate shapes (not merged with each other)", () => {
    const outline = [node("A", "集合A", [node("a1", "りんご"), node("a2", "りんご")])];
    const layout = layoutVenn(outline, 2);
    // Same text, same single set -> same combination key -> they DO merge,
    // per doc/spec.md §6.2.2's "identical text = same element" rule, even
    // within one set.
    const applesShape = layout.find((l) => l.text === "りんご")!;
    expect(applesShape.nodeIds.sort()).toEqual(["a1", "a2"].sort());
  });

  it("never merges two distinct freshly-added elements that are both still empty text", () => {
    const outline = [node("A", "集合A", [node("a1", ""), node("a2", "")])];
    const layout = layoutVenn(outline, 2);
    // depth 1 = item-level shapes only, excluding the (also text: "") circles.
    const emptyItemShapes = layout.filter((l) => l.depth === 1 && l.text === "");
    expect(emptyItemShapes).toHaveLength(2);
  });

  it("merges an element common to all 3 sets into one shape with 3 nodeIds", () => {
    const outline = [
      node("A", "A", [node("a1", "共通")]),
      node("B", "B", [node("b1", "共通")]),
      node("C", "C", [node("c1", "共通")]),
    ];
    const layout = layoutVenn(outline, 3);
    const shared = layout.find((l) => l.text === "共通")!;
    expect(shared.nodeIds).toHaveLength(3);
  });

  it("places set labels inside their own circle, borderless, spread apart horizontally", () => {
    const outline = [node("A", "A"), node("B", "B")];
    const layout = layoutVenn(outline, 2);
    const circleA = layout.find((l) => l.nodeIds.includes("A") && l.kind === "ellipse")!;
    const a = layout.find((l) => l.nodeIds.includes("A") && l.kind === "label")!;
    const b = layout.find((l) => l.nodeIds.includes("B") && l.kind === "label")!;
    expect(a.x).not.toBe(b.x);
    expect(a.y).toBe(b.y);
    // Inside circle A's vertical span, not above/below it.
    expect(a.y).toBeGreaterThan(circleA.y);
    expect(a.y + a.height).toBeLessThan(circleA.y + circleA.height);
  });

  it("places each set's circle behind its label (circle first, in the same array position order used for zIndex)", () => {
    const outline = [node("A", "A"), node("B", "B")];
    const layout = layoutVenn(outline, 2);
    const circleIndex = layout.findIndex((l) => l.nodeIds.includes("A") && l.kind === "ellipse");
    const labelIndex = layout.findIndex((l) => l.nodeIds.includes("A") && l.kind !== "ellipse");
    expect(circleIndex).toBeGreaterThanOrEqual(0);
    expect(circleIndex).toBeLessThan(labelIndex);
  });

  // Reproduces the reported bug: the 3rd circle in the 3-set layout sits
  // below the other two, so its label must sit near its own bottom edge
  // (not near the top, which would land in the top two circles' overlap
  // region), while still staying inside the circle.
  it("places the 3rd set's label near the bottom of its own circle, not the top (3-set layout)", () => {
    const outline = [node("A", "A"), node("B", "B"), node("C", "C")];
    const layout = layoutVenn(outline, 3);
    const circleC = layout.find((l) => l.nodeIds.includes("C") && l.kind === "ellipse")!;
    const labelC = layout.find((l) => l.nodeIds.includes("C") && l.kind === "label")!;
    const circleCenterY = circleC.y + circleC.height / 2;
    expect(labelC.y).toBeGreaterThan(circleCenterY);
    expect(labelC.y + labelC.height).toBeLessThan(circleC.y + circleC.height);
  });

  // The top two circles' centers are offset diagonally (not just vertically)
  // from the diagram's overall center, so their labels must follow along -
  // sitting further left/right of their own circle's center, not directly
  // above it - to stay on the center-through-circle-center line and mirror
  // each other left/right.
  it("offsets the top two sets' labels horizontally off their circle's own center, mirrored (3-set layout)", () => {
    const outline = [node("A", "A"), node("B", "B"), node("C", "C")];
    const layout = layoutVenn(outline, 3);
    const circleA = layout.find((l) => l.nodeIds.includes("A") && l.kind === "ellipse")!;
    const labelA = layout.find((l) => l.nodeIds.includes("A") && l.kind === "label")!;
    const labelB = layout.find((l) => l.nodeIds.includes("B") && l.kind === "label")!;
    const circleACenterX = circleA.x + circleA.width / 2;
    expect(labelA.x + labelA.width / 2).toBeLessThan(circleACenterX);
    expect(labelA.y).toBe(labelB.y);
    expect(labelA.x + labelA.width / 2).toBe(-(labelB.x + labelB.width / 2));
  });

  it("caps at 3 sets even if the outline has more roots", () => {
    const outline = [node("A", "A"), node("B", "B"), node("C", "C"), node("D", "D")];
    const layout = layoutVenn(outline, 3);
    expect(layout.some((l) => l.nodeIds.includes("D"))).toBe(false);
  });
});
