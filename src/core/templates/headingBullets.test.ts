import { describe, expect, it } from "vitest";
import { layoutHeadingBullets } from "./headingBullets";
import type { OutlineNode } from "../model/document";

function node(id: string, text: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text, children };
}

describe("layoutHeadingBullets", () => {
  it("returns an empty layout for an empty outline", () => {
    expect(layoutHeadingBullets([])).toEqual([]);
  });

  it("generates one heading shape per row and one bullet shape per child", () => {
    const outline = [
      node("r1", "消費者の概況", [node("a", "普及率はほぼ100%"), node("b", "若年層がボリュームゾーン")]),
      node("r2", "規制の状況", [node("c", "外資規制が厳しい")]),
    ];
    const layout = layoutHeadingBullets(outline);
    const headings = layout.filter((l) => l.kind === "heading");
    const bullets = layout.filter((l) => l.kind === "label");
    expect(headings).toHaveLength(2);
    expect(bullets).toHaveLength(3);
  });

  it("places a row's heading to the left of its own bullets, left-aligned with a bullet marker", () => {
    const outline = [node("r1", "見出し", [node("a", "項目1")])];
    const layout = layoutHeadingBullets(outline);
    const heading = layout.find((l) => l.nodeIds.includes("r1"))!;
    const bullet = layout.find((l) => l.nodeIds.includes("a"))!;
    expect(heading.x).toBe(0);
    expect(bullet.x).toBeGreaterThan(heading.x + heading.width);
    expect(bullet.align).toBe("left");
    expect(bullet.bulletMarker).toBe("• ");
  });

  it("stacks a row's bullets vertically without overlapping", () => {
    const outline = [node("r1", "見出し", [node("a", "項目1"), node("b", "項目2"), node("c", "項目3")])];
    const layout = layoutHeadingBullets(outline);
    const bullets = layout.filter((l) => l.depth === 1);
    expect(bullets).toHaveLength(3);
    const ys = bullets.map((b) => b.y);
    expect(new Set(ys).size).toBe(3);
    expect(bullets.every((b) => b.x === bullets[0].x)).toBe(true);
  });

  it("gives a row with more bullets a taller heading cell than a row with fewer", () => {
    const outline = [
      node("r1", "少ない", [node("a", "1")]),
      node("r2", "多い", [node("b", "1"), node("c", "2"), node("d", "3"), node("e", "4")]),
    ];
    const layout = layoutHeadingBullets(outline);
    const h1 = layout.find((l) => l.nodeIds.includes("r1"))!;
    const h2 = layout.find((l) => l.nodeIds.includes("r2"))!;
    expect(h2.height).toBeGreaterThan(h1.height);
  });

  it("stacks the 2nd row's heading below the 1st, leaving a small gap so their blocks read as separate", () => {
    const outline = [node("r1", "A", [node("a", "1")]), node("r2", "B", [node("b", "1")])];
    const layout = layoutHeadingBullets(outline);
    const h1 = layout.find((l) => l.nodeIds.includes("r1"))!;
    const h2 = layout.find((l) => l.nodeIds.includes("r2"))!;
    expect(h2.y).toBeGreaterThan(h1.y + h1.height); // small gap, not touching
    expect(h2.y).toBeLessThan(h1.y + h1.height + 10); // but not a large one
  });

  it("places one dashed separator between rows, but none above the first or below the last", () => {
    const outline = [node("r1", "A", [node("a", "1")]), node("r2", "B", [node("b", "1")]), node("r3", "C", [node("c", "1")])];
    const layout = layoutHeadingBullets(outline);
    const separators = layout.filter((l) => l.kind === "line");
    expect(separators).toHaveLength(2); // between r1/r2 and r2/r3, none at the very top/bottom
  });

  it("handles a row with no bullets yet without error, using a minimum row height", () => {
    const outline = [node("r1", "見出しのみ")];
    const layout = layoutHeadingBullets(outline);
    const heading = layout.find((l) => l.nodeIds.includes("r1"))!;
    expect(heading.height).toBeGreaterThan(0);
    expect(layout.filter((l) => l.depth === 1)).toHaveLength(0);
  });
});
