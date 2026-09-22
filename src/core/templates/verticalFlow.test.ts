import { describe, expect, it } from "vitest";
import { layoutVerticalFlow } from "./verticalFlow";
import type { OutlineNode } from "../model/document";

function node(id: string, text: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text, children };
}

// A step with a pre-filled badge child plus zero or more description
// lines - the shape a fresh root node (sync.ts) is prefilled with.
function step(id: string, title: string, badgeText: string, descTexts: string[] = []): OutlineNode {
  return node(id, title, [node(`${id}-badge`, badgeText), ...descTexts.map((t, i) => node(`${id}-d${i}`, t))]);
}

describe("layoutVerticalFlow", () => {
  it("returns nothing for an empty outline", () => {
    expect(layoutVerticalFlow([])).toEqual([]);
  });

  it("renders one badge and one title per step", () => {
    const outline = [step("s1", "カジュアル面談", "STEP 0")];
    const layout = layoutVerticalFlow(outline);
    const badge = layout.find((l) => l.kind === "heading")!;
    expect(badge.text).toBe("STEP 0");
    expect(badge.nodeIds).toEqual(["s1-badge"]);
    const title = layout.find((l) => l.nodeIds.includes("s1"))!;
    expect(title.text).toBe("カジュアル面談");
    expect(title.fontWeight).toBe("bold");
  });

  it("stacks description lines below the title, one per remaining child", () => {
    const outline = [step("s1", "書類選考", "STEP 1", ["今までのご経験やキャリアを確認します。", "選考への案内はなるべく早くご案内します。"])];
    const layout = layoutVerticalFlow(outline);
    const descs = layout.filter((l) => l.nodeIds.includes("s1-d0") || l.nodeIds.includes("s1-d1"));
    expect(descs).toHaveLength(2);
    const [d0, d1] = ["s1-d0", "s1-d1"].map((id) => layout.find((l) => l.nodeIds.includes(id))!);
    expect(d1.y).toBeGreaterThan(d0.y);
  });

  it("stacks steps top to bottom", () => {
    const outline = [step("s1", "ステップ1", "STEP 0"), step("s2", "ステップ2", "STEP 1")];
    const layout = layoutVerticalFlow(outline);
    const badge1 = layout.find((l) => l.nodeIds.includes("s1-badge"))!;
    const badge2 = layout.find((l) => l.nodeIds.includes("s2-badge"))!;
    expect(badge2.y).toBeGreaterThan(badge1.y);
  });

  it("a step with more description lines pushes the next step further down", () => {
    const short = layoutVerticalFlow([step("s1", "短い", "STEP 0"), step("s2", "次", "STEP 1")]);
    const long = layoutVerticalFlow([step("s1", "長い", "STEP 0", ["説明1", "説明2", "説明3"]), step("s2", "次", "STEP 1")]);
    const shortNext = short.find((l) => l.nodeIds.includes("s2-badge"))!;
    const longNext = long.find((l) => l.nodeIds.includes("s2-badge"))!;
    expect(longNext.y).toBeGreaterThan(shortNext.y);
  });

  it("connects consecutive badges with a dashed, arrowhead-tipped line, one fewer than the step count", () => {
    const outline = [step("s1", "1", "STEP 0"), step("s2", "2", "STEP 1"), step("s3", "3", "STEP 2")];
    const layout = layoutVerticalFlow(outline);
    const connectors = layout.filter((l) => l.kind === "line");
    expect(connectors).toHaveLength(2);
    expect(connectors.every((c) => c.arrowhead)).toBe(true);
    expect(connectors.every((c) => c.dashed !== false)).toBe(true);
    expect(connectors.every((c) => c.nodeIds.length === 0)).toBe(true);
  });

  it("gives the last step's badge the accent color, and earlier steps progressively darker shades", () => {
    const outline = [step("s1", "1", "STEP 0"), step("s2", "2", "STEP 1"), step("s3", "3", "JOIN !!")];
    const layout = layoutVerticalFlow(outline);
    const badge1 = layout.find((l) => l.nodeIds.includes("s1-badge"))!;
    const badge2 = layout.find((l) => l.nodeIds.includes("s2-badge"))!;
    const badge3 = layout.find((l) => l.nodeIds.includes("s3-badge"))!;
    expect(badge3.fillColorSlot).toBe("accent");
    expect(badge2.fillColorSlot).toBe(3);
    expect(badge1.fillColorSlot).toBe(4);
    // Contrast slot always matches the fill slot, for legible label text.
    expect(badge1.contrastBgColorSlot).toBe(badge1.fillColorSlot);
    expect(badge3.contrastBgColorSlot).toBe(badge3.fillColorSlot);
  });

  it("handles a step missing its badge/description children without throwing (defensive)", () => {
    const outline = [node("s1", "タイトルのみ", [])];
    expect(() => layoutVerticalFlow(outline)).not.toThrow();
    const layout = layoutVerticalFlow(outline);
    const badge = layout.find((l) => l.kind === "heading")!;
    expect(badge.text).toBe("");
    expect(badge.nodeIds).toEqual([]);
  });
});
