import { describe, expect, it } from "vitest";
import { layoutCycle } from "./cycle";
import type { OutlineNode } from "../model/document";

function node(id: string, text: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text, children };
}

function arrows(layout: ReturnType<typeof layoutCycle>) {
  return layout.filter((l) => l.kind === "polygon");
}

function center(l: { x: number; y: number; width: number; height: number }) {
  return { x: l.x + l.width / 2, y: l.y + l.height / 2 };
}

describe("layoutCycle", () => {
  it("returns nothing for an empty outline, even with a title", () => {
    expect(layoutCycle([], "格差の連鎖", false)).toEqual([]);
  });

  it("draws one filled arrow per step, before every label", () => {
    const layout = layoutCycle([node("a", "A"), node("b", "B"), node("c", "C")], "", false);
    const polys = arrows(layout);
    expect(polys.map((p) => p.nodeIds[0])).toEqual(["a", "b", "c"]);
    for (const p of polys) {
      expect(p.fillColorSlot).toBeDefined();
      for (const pt of p.points!) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(1);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(1);
      }
    }
    const lastPolygon = layout.lastIndexOf(polys[polys.length - 1]);
    expect(layout.slice(0, lastPolygon + 1).every((l) => l.kind === "polygon")).toBe(true);
  });

  it("places steps clockwise from the top", () => {
    const layout = layoutCycle([node("a", "A"), node("b", "B"), node("c", "C"), node("d", "D")], "", false);
    const label = (id: string) => center(layout.find((l) => l.kind === "label" && l.nodeIds[0] === id)!);
    const [a, b, c, d] = ["a", "b", "c", "d"].map(label);
    // a: top-right, b: bottom-right, c: bottom-left, d: top-left
    expect(a.x).toBeGreaterThan(d.x);
    expect(a.y).toBeLessThan(b.y);
    expect(b.x).toBeGreaterThan(c.x);
    expect(d.y).toBeLessThan(c.y);
  });

  it("stacks a step's descendants as extra centered lines below its own text", () => {
    const layout = layoutCycle([node("a", "非正規雇用", [node("a1", "では賃金が")])], "", false);
    const a = layout.find((l) => l.nodeIds[0] === "a" && l.kind === "label")!;
    const a1 = layout.find((l) => l.nodeIds[0] === "a1")!;
    expect(a1.y).toBeGreaterThan(a.y);
    expect(a1.x).toBe(a.x);
    expect(a1.align).toBe("center");
  });

  it("draws the title in the middle as an untracked label", () => {
    const layout = layoutCycle([node("a", "A"), node("b", "B")], "格差の連鎖", false);
    const title = layout.find((l) => l.text === "格差の連鎖")!;
    expect(title.nodeIds).toEqual([]);
    const ring = arrows(layout);
    const minX = Math.min(...ring.map((p) => p.x));
    const maxX = Math.max(...ring.map((p) => p.x + p.width));
    expect(center(title).x).toBeCloseTo((minX + maxX) / 2, 0);
  });

  it("darkens the second half of the loop", () => {
    const polys = arrows(layoutCycle([node("a", "A"), node("b", "B"), node("c", "C"), node("d", "D")], "", false));
    expect(polys[0].fillColorSlot).toBe(polys[1].fillColorSlot);
    expect(polys[2].fillColorSlot).toBe(polys[3].fillColorSlot);
    expect(polys[0].fillColorSlot).not.toBe(polys[2].fillColorSlot);
  });

  describe("with an entry", () => {
    const outline = [
      node("e", "非正規雇用形態で就労開始", [node("e1", "何らかの理由で", [node("e1-1", "正規雇用での")])]),
      node("s", "非正規雇用からの脱却は困難"),
      node("r1", "賃金が低水準"),
      node("r2", "貯蓄が困難"),
      node("r3", "教育格差"),
    ];
    const layout = layoutCycle(outline, "", true);

    it("puts the entry arrow left of the straight arrow, both on the top band", () => {
      const [entry, straight] = arrows(layout);
      expect(entry.nodeIds).toEqual(["e"]);
      expect(straight.nodeIds).toEqual(["s"]);
      expect(entry.x).toBeLessThan(straight.x);
      expect(entry.y).toBe(straight.y);
      expect(entry.height).toBe(straight.height);
    });

    it("keeps the curved arrows below the straight arrow's top edge", () => {
      const [, straight, ...curved] = arrows(layout);
      expect(curved).toHaveLength(3);
      for (const c of curved) expect(c.y).toBeGreaterThanOrEqual(straight.y);
    });

    it("renders the entry's children as bullets and grandchildren as indented continuation lines", () => {
      const heading = layout.find((l) => l.nodeIds[0] === "e" && l.kind === "label")!;
      const bullet = layout.find((l) => l.nodeIds[0] === "e1")!;
      const cont = layout.find((l) => l.nodeIds[0] === "e1-1")!;
      expect(heading.bulletMarker).toBeUndefined();
      expect(bullet.bulletMarker).toBe("• ");
      expect(cont.bulletMarker).toBeUndefined();
      expect(cont.x).toBeGreaterThan(bullet.x);
      expect(cont.y).toBeGreaterThan(bullet.y);
    });

    it("handles an outline with only the entry", () => {
      expect(arrows(layoutCycle([node("e", "開始")], "", true))).toHaveLength(1);
    });
  });
});
