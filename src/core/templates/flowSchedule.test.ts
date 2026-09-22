import { describe, expect, it } from "vitest";
import { layoutFlowSchedule } from "./flowSchedule";
import type { OutlineNode } from "../model/document";

function node(id: string, text: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text, children };
}

describe("layoutFlowSchedule", () => {
  it("returns nothing for an empty outline with no title", () => {
    expect(layoutFlowSchedule([], "")).toEqual([]);
  });

  it("renders one heading per row, numbered from 01 via bulletMarker (not baked into content)", () => {
    const outline = [node("r1", "お問い合わせ"), node("r2", "ヒアリング")];
    const layout = layoutFlowSchedule(outline, "");
    const h1 = layout.find((l) => l.nodeIds.includes("r1"))!;
    const h2 = layout.find((l) => l.nodeIds.includes("r2"))!;
    expect(h1.kind).toBe("heading");
    expect(h1.text).toBe("お問い合わせ");
    expect(h1.bulletMarker).toBe("01 | ");
    expect(h2.bulletMarker).toBe("02 | ");
  });

  it("stacks description lines in the content column, one per child, without a bullet marker", () => {
    const outline = [node("r1", "お見積り提出", [node("d0", "ヒアリングの内容をもとに作成"), node("d1", "PDFでご提出いたします")])];
    const layout = layoutFlowSchedule(outline, "");
    const d0 = layout.find((l) => l.nodeIds.includes("d0"))!;
    const d1 = layout.find((l) => l.nodeIds.includes("d1"))!;
    expect(d0.bulletMarker).toBeUndefined();
    expect(d1.bulletMarker).toBeUndefined();
    expect(d1.y).toBeGreaterThan(d0.y);
    expect(d0.x).toBeGreaterThan(layout.find((l) => l.nodeIds.includes("r1"))!.x);
  });

  it("stacks rows top to bottom", () => {
    const outline = [node("r1", "行1"), node("r2", "行2")];
    const layout = layoutFlowSchedule(outline, "");
    const h1 = layout.find((l) => l.nodeIds.includes("r1"))!;
    const h2 = layout.find((l) => l.nodeIds.includes("r2"))!;
    expect(h2.y).toBeGreaterThan(h1.y);
  });

  it("a row with more description lines pushes the next row further down", () => {
    const short = layoutFlowSchedule([node("r1", "短い"), node("r2", "次")], "");
    const long = layoutFlowSchedule([node("r1", "長い", [node("d0", "1"), node("d1", "2"), node("d2", "3")]), node("r2", "次")], "");
    const shortNext = short.find((l) => l.nodeIds.includes("r2"))!;
    const longNext = long.find((l) => l.nodeIds.includes("r2"))!;
    expect(longNext.y).toBeGreaterThan(shortNext.y);
  });

  it("draws a dashed separator between rows but not above the first or below the last", () => {
    const outline = [node("r1", "1"), node("r2", "2"), node("r3", "3")];
    const layout = layoutFlowSchedule(outline, "");
    const separators = layout.filter((l) => l.kind === "line");
    expect(separators).toHaveLength(2);
    expect(separators.every((s) => s.nodeIds.length === 0)).toBe(true);
  });

  it("renders an untracked, accent-colored, centered title with no flanking rules when title is blank", () => {
    const outline = [node("r1", "1")];
    const layout = layoutFlowSchedule(outline, "  ");
    expect(layout.some((l) => l.textColorSlot === "accent")).toBe(false);
  });

  it("renders the title flanked by two dashed rules, and pushes the first row below it", () => {
    const withTitle = layoutFlowSchedule([node("r1", "1")], "フロースケジュール（縦）");
    const withoutTitle = layoutFlowSchedule([node("r1", "1")], "");
    const title = withTitle.find((l) => l.text === "フロースケジュール（縦）")!;
    expect(title.textColorSlot).toBe("accent");
    expect(title.align).toBe("center");
    expect(title.nodeIds).toEqual([]);

    const rules = withTitle.filter((l) => l.kind === "line" && l.nodeIds.length === 0 && l.text === "");
    // 1 title-flanking pair (2 rules); the row-separator rule count is
    // asserted separately above, and this outline has only 1 row (0 of those).
    expect(rules).toHaveLength(2);

    const rowWithTitle = withTitle.find((l) => l.nodeIds.includes("r1"))!;
    const rowWithoutTitle = withoutTitle.find((l) => l.nodeIds.includes("r1"))!;
    expect(rowWithTitle.y).toBeGreaterThan(rowWithoutTitle.y);
  });

  it("handles a row with no description children without throwing (defensive)", () => {
    const outline = [node("r1", "タイトルのみ", [])];
    expect(() => layoutFlowSchedule(outline, "")).not.toThrow();
  });
});
