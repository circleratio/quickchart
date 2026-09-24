import { describe, expect, it } from "vitest";
import { layoutFlowScheduleHorizontal } from "./flowScheduleHorizontal";
import type { OutlineNode } from "../model/document";
import { fillSlotOf } from "./layoutNode";

function node(id: string, text: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text, children };
}

describe("layoutFlowScheduleHorizontal", () => {
  it("returns nothing for an empty outline with no title", () => {
    expect(layoutFlowScheduleHorizontal([], "")).toEqual([]);
  });

  it("renders one card, one number, and one label per step", () => {
    const outline = [node("s1", "お問い合わせ")];
    const layout = layoutFlowScheduleHorizontal(outline, "");
    const card = layout.find((l) => l.kind === "rect")!;
    expect(card.nodeIds).toEqual(["s1"]);
    expect(card.cornerRadius).toBeGreaterThan(0);

    const number = layout.find((l) => l.text === "01")!;
    expect(number.nodeIds).toEqual([]);
    expect(number.align).toBe("center");

    const label = layout.find((l) => l.kind === "label" && l.nodeIds.includes("s1"))!;
    expect(label.text).toBe("お問い合わせ");
    expect(label.fontWeight).toBe("bold");
  });

  it("numbers steps 01, 02, 03... from their outline order", () => {
    const outline = [node("s1", "1"), node("s2", "2"), node("s3", "3")];
    const layout = layoutFlowScheduleHorizontal(outline, "");
    expect(layout.some((l) => l.text === "01")).toBe(true);
    expect(layout.some((l) => l.text === "02")).toBe(true);
    expect(layout.some((l) => l.text === "03")).toBe(true);
  });

  it("stacks description lines below the label, one per child, without a bullet marker", () => {
    const outline = [node("s1", "ヒアリング", [node("d0", "現状や課題のヒアリングを行います"), node("d1", "最適なソリューションをご提案いたします")])];
    const layout = layoutFlowScheduleHorizontal(outline, "");
    const d0 = layout.find((l) => l.nodeIds.includes("d0"))!;
    const d1 = layout.find((l) => l.nodeIds.includes("d1"))!;
    expect(d0.bulletMarker).toBeUndefined();
    expect(d1.y).toBeGreaterThan(d0.y);
  });

  it("places steps left to right", () => {
    const outline = [node("s1", "1"), node("s2", "2")];
    const layout = layoutFlowScheduleHorizontal(outline, "");
    const card1 = layout.find((l) => l.nodeIds.includes("s1") && l.kind === "rect")!;
    const card2 = layout.find((l) => l.nodeIds.includes("s2") && l.kind === "rect")!;
    expect(card2.x).toBeGreaterThan(card1.x);
    // Same row: every card shares one y.
    expect(card2.y).toBe(card1.y);
  });

  it("gives every card the same height, driven by the step with the most description lines", () => {
    const outline = [node("s1", "短い"), node("s2", "長い", [node("d0", "1"), node("d1", "2"), node("d2", "3")])];
    const layout = layoutFlowScheduleHorizontal(outline, "");
    const card1 = layout.find((l) => l.nodeIds.includes("s1") && l.kind === "rect")!;
    const card2 = layout.find((l) => l.nodeIds.includes("s2") && l.kind === "rect")!;
    expect(card1.height).toBe(card2.height);
  });

  it("draws one filled right-pointing triangle connector between each pair of adjacent cards", () => {
    const outline = [node("s1", "1"), node("s2", "2"), node("s3", "3")];
    const layout = layoutFlowScheduleHorizontal(outline, "");
    const triangles = layout.filter((l) => l.kind === "polygon");
    expect(triangles).toHaveLength(2);
    expect(triangles.every((t) => fillSlotOf(t) === 0)).toBe(true);
    expect(triangles.every((t) => t.nodeIds.length === 0)).toBe(true);
    // Right-pointing: the far vertex (index 2) sits at x fraction 1, midway
    // down (y fraction 0.5) - see RIGHT_TRIANGLE_POINTS.
    expect(triangles[0].points?.[2]).toEqual({ x: 1, y: 0.5 });
  });

  it("centers a triangle connector vertically against the card row", () => {
    const outline = [node("s1", "1"), node("s2", "2")];
    const layout = layoutFlowScheduleHorizontal(outline, "");
    const card = layout.find((l) => l.kind === "rect")!;
    const triangle = layout.find((l) => l.kind === "polygon")!;
    const cardCenterY = card.y + card.height / 2;
    const triangleCenterY = triangle.y + triangle.height / 2;
    expect(triangleCenterY).toBeCloseTo(cardCenterY);
  });

  it("renders the title flanked by two dashed rules, with no textColorSlot override, and pushes the row below it", () => {
    // 5 steps, as in the reference image - wide enough that the title band
    // doesn't consume the whole row width (see the single-step case below).
    const steps = ["1", "2", "3", "4", "5"].map((t, i) => node(`s${i}`, t));
    const withTitle = layoutFlowScheduleHorizontal(steps, "フロースケジュール（横）");
    const withoutTitle = layoutFlowScheduleHorizontal(steps, "");
    const title = withTitle.find((l) => l.text === "フロースケジュール（横）")!;
    expect(title.textColorSlot).toBeUndefined();
    expect(title.align).toBe("center");
    expect(title.nodeIds).toEqual([]);

    const rules = withTitle.filter((l) => l.kind === "line");
    expect(rules).toHaveLength(2);

    const cardWithTitle = withTitle.find((l) => l.kind === "rect")!;
    const cardWithoutTitle = withoutTitle.find((l) => l.kind === "rect")!;
    expect(cardWithTitle.y).toBeGreaterThan(cardWithoutTitle.y);
  });

  it("renders no title (and no flanking rules) when the title is blank", () => {
    const layout = layoutFlowScheduleHorizontal([node("s1", "1")], "   ");
    expect(layout.some((l) => l.kind === "line")).toBe(false);
  });

  it("handles a step with no description children without throwing (defensive)", () => {
    const outline = [node("s1", "ラベルのみ", [])];
    expect(() => layoutFlowScheduleHorizontal(outline, "")).not.toThrow();
  });
});
