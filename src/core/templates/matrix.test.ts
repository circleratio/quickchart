import { describe, expect, it } from "vitest";
import { layoutMatrix, matrixParams, MATRIX_MAX_ROOTS } from "./matrix";
import type { OutlineNode } from "../model/document";
import { fillSlotOf, strokeSlotOf } from "./layoutNode";

function node(id: string, text: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text, children };
}

const quadrants = (...children: OutlineNode[][]) =>
  ["q1", "q2", "q3", "q4"].map((id, i) => node(id, id.toUpperCase(), children[i] ?? []));

function box(layout: ReturnType<typeof layoutMatrix>, id: string) {
  return layout.find((l) => l.kind === "rect" && l.nodeIds[0] === id && l.cornerRadius === undefined)!;
}
function badgeLabel(layout: ReturnType<typeof layoutMatrix>, id: string) {
  return layout.find((l) => l.kind === "label" && l.nodeIds[0] === id)!;
}

describe("layoutMatrix", () => {
  it("returns an empty layout for an empty outline", () => {
    expect(layoutMatrix([])).toEqual([]);
  });

  it("places 4 quadrants in natural reading order: top-left, top-right, bottom-left, bottom-right", () => {
    const layout = layoutMatrix(quadrants());
    const [q1, q2, q3, q4] = ["q1", "q2", "q3", "q4"].map((id) => box(layout, id));
    expect(q1.x).toBeLessThan(q2.x);
    expect(q1.y).toBe(q2.y);
    expect(q1.y).toBeLessThan(q3.y);
    expect(q1.x).toBe(q3.x);
    expect(q4.x).toBeGreaterThan(q3.x);
    expect(q4.y).toBeGreaterThan(q2.y);
  });

  it("ignores a 5th+ root defensively", () => {
    const layout = layoutMatrix([...quadrants(), node("q5", "Q5")]);
    expect(layout.some((l) => l.nodeIds.includes("q5"))).toBe(false);
    expect(MATRIX_MAX_ROOTS).toBe(4);
  });

  it("puts the badge at the top of a top-row quadrant and at the bottom of a bottom-row one", () => {
    const layout = layoutMatrix(quadrants([node("a", "a")], [], [node("b", "b")]));
    const q1 = box(layout, "q1");
    const q3 = box(layout, "q3");
    const b1 = badgeLabel(layout, "q1");
    const b3 = badgeLabel(layout, "q3");
    const bulletA = layout.find((l) => l.nodeIds[0] === "a")!;
    const bulletB = layout.find((l) => l.nodeIds[0] === "b")!;

    expect(b1.y - q1.y).toBeLessThan(q1.y + q1.height - (b1.y + b1.height));
    expect(bulletA.y).toBeGreaterThan(b1.y);
    expect(b3.y - q3.y).toBeGreaterThan(q3.y + q3.height - (b3.y + b3.height));
    expect(bulletB.y).toBeLessThan(b3.y);
  });

  it("gives each quadrant's badge its own look, the last one unfilled", () => {
    const layout = layoutMatrix(quadrants());
    const badges = layout.filter((l) => l.kind === "rect" && l.cornerRadius !== undefined);
    expect(badges).toHaveLength(4);
    expect(new Set(badges.slice(0, 3).map((b) => fillSlotOf(b))).size).toBe(3);
    expect(fillSlotOf(badges[3])).toBeUndefined();
    expect(strokeSlotOf(badges[3])).toBeDefined();
  });

  it("marks bullets with '□ ' and indents continuation lines", () => {
    const layout = layoutMatrix(quadrants([node("a", "高度な専門性を駆使し、", [node("a1", "業績向上に貢献する")]), node("b", "次")]));
    const a = layout.find((l) => l.nodeIds[0] === "a")!;
    const a1 = layout.find((l) => l.nodeIds[0] === "a1")!;
    const b = layout.find((l) => l.nodeIds[0] === "b")!;
    expect(a.bulletMarker).toBe("□ ");
    expect(a1.bulletMarker).toBeUndefined();
    expect(a1.x).toBeGreaterThan(a.x);
    expect(a1.y).toBeGreaterThan(a.y);
    expect(b.y).toBeGreaterThan(a1.y);
  });

  it("grows every quadrant to fit the fullest one", () => {
    const many = Array.from({ length: 20 }, (_, i) => node(`b${i}`, `項目${i}`));
    const layout = layoutMatrix(quadrants(many));
    const heights = ["q1", "q2", "q3", "q4"].map((id) => box(layout, id).height);
    expect(new Set(heights).size).toBe(1);
    const last = layout.find((l) => l.nodeIds[0] === "b19")!;
    expect(last.y + last.height).toBeLessThanOrEqual(box(layout, "q1").y + heights[0]);
  });

  it("draws a cross of two arrows through the grid's center, overhanging it", () => {
    const layout = layoutMatrix(quadrants());
    const arrows = layout.filter((l) => l.kind === "polygon");
    expect(arrows).toHaveLength(2);
    const q1 = box(layout, "q1");
    const q4 = box(layout, "q4");
    const horizontal = arrows.find((a) => a.width > a.height)!;
    const vertical = arrows.find((a) => a.height > a.width)!;
    expect(horizontal.x).toBeLessThan(q1.x);
    expect(horizontal.x + horizontal.width).toBeGreaterThan(q4.x + q4.width);
    expect(vertical.y).toBeLessThan(q1.y);
    expect(vertical.y + vertical.height).toBeGreaterThan(q4.y + q4.height);
  });

  it("places each axis-end label beyond its arrow end, only when set", () => {
    const layout = layoutMatrix(quadrants(), { axisTop: "創造", axisBottom: "運用", axisLeft: "個人", axisRight: " " });
    const q1 = box(layout, "q1");
    const q4 = box(layout, "q4");
    const label = (text: string) => layout.find((l) => l.text === text)!;
    expect(label("創造").y + label("創造").height).toBeLessThan(q1.y);
    expect(label("運用").y).toBeGreaterThan(q4.y + q4.height);
    expect(label("個人").x + label("個人").width).toBeLessThan(q1.x);
    expect(label("創造").textColorSlot).toBe("accent");
    expect(layout.filter((l) => l.nodeIds.length === 0 && l.kind === "label")).toHaveLength(3);
  });

  it("puts an underlined title above everything", () => {
    const layout = layoutMatrix(quadrants(), { title: "人材活用のための分類", axisTop: "創造" });
    const title = layout.find((l) => l.text === "人材活用のための分類")!;
    expect(title.underline).toBe(true);
    expect(Math.min(...layout.map((l) => l.y))).toBe(title.y);
  });
});

describe("matrixParams", () => {
  it("falls back to the pre-redesign axis names for the right/top ends", () => {
    expect(matrixParams({ axisXLabel: "シェア", axisYLabel: "成長性" })).toEqual({
      title: "",
      axisTop: "成長性",
      axisBottom: "",
      axisLeft: "",
      axisRight: "シェア",
    });
  });

  it("prefers the new fields when both are present", () => {
    expect(matrixParams({ axisXLabel: "旧", axisRight: "新" }).axisRight).toBe("新");
  });
});
