import { describe, expect, it } from "vitest";
import { layoutPyramid } from "./pyramid";
import { layoutLogicTree } from "./logicTree";
import type { OutlineNode } from "../model/document";

function node(id: string, text: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text, children };
}

describe("layoutPyramid", () => {
  it("returns an empty layout for an empty outline", () => {
    expect(layoutPyramid([])).toEqual([]);
  });

  it("places a single root at depth 0", () => {
    const layout = layoutPyramid([node("a", "root")]);
    expect(layout).toHaveLength(1);
    expect(layout[0]).toMatchObject({ nodeIds: ["a"], depth: 0 });
  });

  it("places children below their parent (greater y) and centers the parent over them", () => {
    const outline = [node("root", "root", [node("c1", "c1"), node("c2", "c2")])];
    const layout = layoutPyramid(outline);
    const root = layout.find((l) => l.nodeIds.includes("root"))!;
    const c1 = layout.find((l) => l.nodeIds.includes("c1"))!;
    const c2 = layout.find((l) => l.nodeIds.includes("c2"))!;

    expect(c1.y).toBeGreaterThan(root.y);
    expect(c2.y).toBeGreaterThan(root.y);
    expect(c1.y).toBe(c2.y); // siblings on the same row
    expect(c1.x).not.toBe(c2.x); // spread apart horizontally

    const rootCenter = root.x + root.width / 2;
    const childrenCenter = (c1.x + c1.width / 2 + c2.x + c2.width / 2) / 2;
    expect(rootCenter).toBeCloseTo(childrenCenter);
  });

  it("gives every leaf a distinct x position so siblings don't overlap", () => {
    const outline = [node("root", "root", [node("c1", "c1"), node("c2", "c2"), node("c3", "c3")])];
    const layout = layoutPyramid(outline);
    const xs = layout.filter((l) => l.depth === 1).map((l) => l.x);
    expect(new Set(xs).size).toBe(3);
  });
});

describe("layoutLogicTree", () => {
  it("returns an empty layout for an empty outline", () => {
    expect(layoutLogicTree([])).toEqual([]);
  });

  it("places children to the right of their parent (greater x), spread vertically", () => {
    const outline = [node("root", "root", [node("c1", "c1"), node("c2", "c2")])];
    const layout = layoutLogicTree(outline);
    const root = layout.find((l) => l.nodeIds.includes("root"))!;
    const c1 = layout.find((l) => l.nodeIds.includes("c1"))!;
    const c2 = layout.find((l) => l.nodeIds.includes("c2"))!;

    expect(c1.x).toBeGreaterThan(root.x);
    expect(c2.x).toBeGreaterThan(root.x);
    expect(c1.x).toBe(c2.x);
    expect(c1.y).not.toBe(c2.y);
  });
});
