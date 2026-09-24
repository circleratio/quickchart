import { describe, expect, it } from "vitest";
import { layoutBeforeAfter } from "./beforeAfter";
import type { OutlineNode } from "../model/document";
import { paintOf, fillSlotOf } from "./layoutNode";

function node(id: string, text: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text, children };
}

// A topic with pre-filled ASIS/TOBE blocks - the shape a fresh root node
// (sync.ts) is prefilled with. The topic's own text is the badge.
function topic(id: string, badge: string, asisHeadline: string, asisDescs: string[], tobeFirstLine: string, tobeExtraLines: string[] = []): OutlineNode {
  return node(id, badge, [
    node(`${id}-asis`, asisHeadline, asisDescs.map((t, i) => node(`${id}-asis-d${i}`, t))),
    node(`${id}-tobe`, tobeFirstLine, tobeExtraLines.map((t, i) => node(`${id}-tobe-l${i}`, t))),
  ]);
}

describe("layoutBeforeAfter", () => {
  it("returns nothing for an empty outline", () => {
    expect(layoutBeforeAfter([])).toEqual([]);
  });

  it("renders the fixed AS-IS/TO-BE sidebar plus each topic's own badge (root text), headline, and TOBE line", () => {
    const outline = [
      topic("t1", "現場の悩み", "工期遅延等による計画変更", ["工期遅延等により、当初の計画より人件費が増える"], "データベース化により採算性分析を効率化"),
    ];
    const layout = layoutBeforeAfter(outline);

    expect(layout.some((l) => l.text === "AS-IS")).toBe(true);
    expect(layout.some((l) => l.text === "TO-BE")).toBe(true);

    const badge = layout.find((l) => l.kind === "heading" && l.nodeIds.includes("t1"))!;
    expect(badge.text).toBe("現場の悩み");

    const headline = layout.find((l) => l.kind === "label" && l.nodeIds.includes("t1-asis"))!;
    expect(headline.text).toBe("工期遅延等による計画変更");
    expect(headline.fontWeight).toBe("bold");

    const tobeLine = layout.find((l) => l.kind === "label" && l.nodeIds.includes("t1-tobe"))!;
    expect(tobeLine.text).toBe("データベース化により採算性分析を効率化");
  });

  it("renders the badge from the topic's own outline node, not a fixed decoration - a different badge per topic", () => {
    const outline = [topic("t1", "現場の悩み", "1", [], "1"), topic("t2", "コスト課題", "2", [], "2")];
    const layout = layoutBeforeAfter(outline);
    const badge1 = layout.find((l) => l.kind === "heading" && l.nodeIds.includes("t1"))!;
    const badge2 = layout.find((l) => l.kind === "heading" && l.nodeIds.includes("t2"))!;
    expect(badge1.text).toBe("現場の悩み");
    expect(badge2.text).toBe("コスト課題");
  });

  it("stacks ASIS description lines below the badge and headline, left-aligned, without a bullet marker", () => {
    const outline = [topic("t1", "バッジ", "見出し", ["説明1", "説明2"], "TOBE見出し")];
    const layout = layoutBeforeAfter(outline);
    const badge = layout.find((l) => l.kind === "heading" && l.nodeIds.includes("t1"))!;
    const d0 = layout.find((l) => l.nodeIds.includes("t1-asis-d0"))!;
    const d1 = layout.find((l) => l.nodeIds.includes("t1-asis-d1"))!;
    expect(d0.align).toBe("left");
    expect(d0.bulletMarker).toBeUndefined();
    expect(d0.y).toBeGreaterThan(badge.y);
    expect(d1.y).toBeGreaterThan(d0.y);
  });

  it("stacks TOBE extra lines below the first line, uniformly styled (bold, same color)", () => {
    const outline = [topic("t1", "バッジ", "見出し", [], "1行目", ["2行目", "3行目"])];
    const layout = layoutBeforeAfter(outline);
    const l0 = layout.find((l) => l.kind === "label" && l.nodeIds.includes("t1-tobe"))!;
    const l1 = layout.find((l) => l.nodeIds.includes("t1-tobe-l0"))!;
    const l2 = layout.find((l) => l.nodeIds.includes("t1-tobe-l1"))!;
    expect(l1.y).toBeGreaterThan(l0.y);
    expect(l2.y).toBeGreaterThan(l1.y);
    expect(l0.fontWeight).toBe(l1.fontWeight);
    expect(l0.textColorSlot).toBe(l1.textColorSlot);
  });

  it("places topics left to right, each with its own ASIS/TOBE cell background", () => {
    const outline = [topic("t1", "b", "1", [], "1"), topic("t2", "b", "2", [], "2")];
    const layout = layoutBeforeAfter(outline);
    const asis1 = layout.find((l) => l.kind === "rect" && paintOf(l) === "neutral" && l.nodeIds.includes("t1-asis"))!;
    const asis2 = layout.find((l) => l.kind === "rect" && paintOf(l) === "neutral" && l.nodeIds.includes("t2-asis"))!;
    expect(asis2.x).toBeGreaterThan(asis1.x);
  });

  it("gives every ASIS cell the same height (driven by the topic with the most description lines) and likewise for TOBE", () => {
    const outline = [topic("t1", "b", "短い", [], "短い"), topic("t2", "b", "長い", ["1", "2", "3"], "長い", ["1", "2"])];
    const layout = layoutBeforeAfter(outline);
    const asis1 = layout.find((l) => l.kind === "rect" && paintOf(l) === "neutral" && l.nodeIds.includes("t1-asis"))!;
    const asis2 = layout.find((l) => l.kind === "rect" && paintOf(l) === "neutral" && l.nodeIds.includes("t2-asis"))!;
    expect(asis1.height).toBe(asis2.height);
    const tobe1 = layout.find((l) => l.kind === "rect" && fillSlotOf(l) === 4 && l.nodeIds.includes("t1-tobe"))!;
    const tobe2 = layout.find((l) => l.kind === "rect" && fillSlotOf(l) === 4 && l.nodeIds.includes("t2-tobe"))!;
    expect(tobe1.height).toBe(tobe2.height);
  });

  it("uses a fixed neutral gray fill for the ASIS cell, and the theme's own pale shade for the TOBE cell", () => {
    const outline = [topic("t1", "b", "1", [], "1")];
    const layout = layoutBeforeAfter(outline);
    const asisCell = layout.find((l) => l.kind === "rect" && l.nodeIds.includes("t1-asis"))!;
    const tobeCell = layout.find((l) => l.kind === "rect" && l.nodeIds.includes("t1-tobe"))!;
    expect(paintOf(asisCell)).toBe("neutral");
    expect(fillSlotOf(asisCell)).toBeUndefined();
    expect(fillSlotOf(tobeCell)).toBe(4);
    expect(tobeCell.cornerRadius).toBeGreaterThan(0);
  });

  it("draws one filled downward-pointing arrow between ASIS and TOBE per topic", () => {
    const outline = [topic("t1", "b", "1", [], "1"), topic("t2", "b", "2", [], "2")];
    const layout = layoutBeforeAfter(outline);
    const arrows = layout.filter((l) => l.kind === "polygon");
    expect(arrows).toHaveLength(2);
    expect(arrows.every((a) => a.nodeIds.length === 0)).toBe(true);
    // Downward: the far vertex sits at y fraction 1, midway across (x 0.5).
    expect(arrows[0].points?.[2]).toEqual({ x: 0.5, y: 1 });

    const asisCell = layout.find((l) => l.kind === "rect" && paintOf(l) === "neutral" && l.nodeIds.includes("t1-asis"))!;
    const tobeCell = layout.find((l) => l.kind === "rect" && fillSlotOf(l) === 4 && l.nodeIds.includes("t1-tobe"))!;
    expect(arrows[0].y).toBeGreaterThan(asisCell.y + asisCell.height - 1);
    expect(arrows[0].y).toBeLessThan(tobeCell.y);
  });

  it("handles a topic missing its ASIS/TOBE children without throwing (defensive)", () => {
    const outline = [node("t1", "バッジ", [])];
    expect(() => layoutBeforeAfter(outline)).not.toThrow();
    const layout = layoutBeforeAfter(outline);
    const asisCell = layout.find((l) => l.kind === "rect" && paintOf(l) === "neutral")!;
    expect(asisCell.nodeIds).toEqual([]);
    const badge = layout.find((l) => l.kind === "heading")!;
    expect(badge.text).toBe("バッジ");
    expect(badge.nodeIds).toEqual(["t1"]);
  });
});
