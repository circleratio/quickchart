import { describe, expect, it } from "vitest";
import { layoutPyramidChart } from "./pyramidChart";
import type { OutlineNode } from "../model/document";
import { fillSlotOf, isDashed } from "./layoutNode";

function node(id: string, text: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text, children };
}

// A pyramid level with a pre-filled "scale" child plus one cell per
// column - the shape emptyPyramidChartRow (sync.ts) produces.
function level(id: string, text: string, scaleText: string, cellTexts: string[]): OutlineNode {
  return node(id, text, [node(`${id}-scale`, scaleText), ...cellTexts.map((t, i) => node(`${id}-c${i}`, t))]);
}

describe("layoutPyramidChart", () => {
  it("returns nothing for an empty outline with no title/columns configured", () => {
    expect(layoutPyramidChart([], [], "")).toEqual([]);
  });

  it("renders the title and column headers even with no rows yet", () => {
    const layout = layoutPyramidChart([], ["定義", "区分1"], "市場規模");
    const title = layout.find((l) => l.text === "市場規模")!;
    expect(title).toBeDefined();
    expect(title.fontWeight).toBe("bold");
    const headers = layout.filter((l) => l.kind === "label" && l.underline);
    expect(headers.map((h) => h.text)).toEqual(["定義", "区分1"]);
  });

  it("places one polygon band per level, one item-name label, and one scale label", () => {
    const outline = [level("l1", "項目1", "規模A", ["定義A"])];
    const layout = layoutPyramidChart(outline, ["定義"], "");
    const band = layout.find((l) => l.kind === "polygon" && l.nodeIds.includes("l1"))!;
    expect(band).toBeDefined();
    const itemLabel = layout.find((l) => l.kind === "label" && l.text === "項目1")!;
    expect(itemLabel).toBeDefined();
    const scaleLabel = layout.find((l) => l.nodeIds.includes("l1-scale"))!;
    expect(scaleLabel.text).toBe("規模A");
  });

  it("apex band (level 0) is a true triangle - its top edge has zero width", () => {
    const outline = [level("l1", "項目1", "", ["A"]), level("l2", "項目2", "", ["B"])];
    const layout = layoutPyramidChart(outline, ["定義"], "");
    const apex = layout.find((l) => l.kind === "polygon" && l.nodeIds.includes("l1"))!;
    const [topLeft, topRight] = apex.points!;
    expect(topLeft.x).toBeCloseTo(topRight.x);
  });

  it("bands widen going down - the last level's bottom edge is the full pyramid width", () => {
    const outline = [level("l1", "項目1", "", ["A"]), level("l2", "項目2", "", ["B"]), level("l3", "項目3", "", ["C"])];
    const layout = layoutPyramidChart(outline, ["定義"], "");
    const last = layout.find((l) => l.kind === "polygon" && l.nodeIds.includes("l3"))!;
    const [, , bottomRight, bottomLeft] = last.points!;
    expect(bottomRight.x - bottomLeft.x).toBeCloseTo(1);
  });

  it("gives each level a different fill slot, darkest (0) at the apex", () => {
    const outline = [level("l1", "項目1", "", ["A"]), level("l2", "項目2", "", ["B"])];
    const layout = layoutPyramidChart(outline, ["定義"], "");
    const band1 = layout.find((l) => l.kind === "polygon" && l.nodeIds.includes("l1"))!;
    const band2 = layout.find((l) => l.kind === "polygon" && l.nodeIds.includes("l2"))!;
    expect(fillSlotOf(band1)).toBe(0);
    expect(fillSlotOf(band2)).toBe(1);
  });

  it("gives the item-name and scale labels contrastBgColorSlot matching their own band's fill, for legible text over any shade", () => {
    const outline = [level("l1", "項目1", "規模A", ["A"])];
    const layout = layoutPyramidChart(outline, ["定義"], "");
    const band = layout.find((l) => l.kind === "polygon" && l.nodeIds.includes("l1"))!;
    const itemLabel = layout.find((l) => l.kind === "label" && l.text === "項目1")!;
    const scaleLabel = layout.find((l) => l.nodeIds.includes("l1-scale"))!;
    expect(itemLabel.contrastBgColorSlot).toBe(fillSlotOf(band));
    expect(scaleLabel.contrastBgColorSlot).toBe(fillSlotOf(band));
  });

  it("stacks levels top to bottom, each row's cells aligned with columnHeaders by position, not text", () => {
    const outline = [
      level("l1", "項目1", "", ["この文字は使われない", "B1"]),
      level("l2", "項目2", "", ["A2", "B2"]),
    ];
    const layout = layoutPyramidChart(outline, ["列1", "列2"], "");
    const band1 = layout.find((l) => l.kind === "polygon" && l.nodeIds.includes("l1"))!;
    const band2 = layout.find((l) => l.kind === "polygon" && l.nodeIds.includes("l2"))!;
    expect(band2.y).toBeGreaterThanOrEqual(band1.y + band1.height);

    const col0Header = layout.find((l) => l.text === "列1")!;
    const cellA1 = layout.find((l) => l.nodeIds.includes("l1-c0"))!;
    expect(cellA1.x).toBeGreaterThanOrEqual(col0Header.x);
    expect(cellA1.x).toBeLessThan(col0Header.x + col0Header.width);
  });

  it("places one dashed separator between rows, none above the first or below the last", () => {
    const outline = [level("l1", "項目1", "", ["A"]), level("l2", "項目2", "", ["B"]), level("l3", "項目3", "", ["C"])];
    const layout = layoutPyramidChart(outline, ["列1"], "");
    const separators = layout.filter((l) => l.kind === "line" && l.height === 0);
    expect(separators).toHaveLength(2);
    expect(separators.every((l) => isDashed(l))).toBe(true);
  });

  it("draws one solid (non-dashed) rule under the title, spanning the full diagram width", () => {
    const outline = [level("l1", "項目1", "", ["A"])];
    const layout = layoutPyramidChart(outline, ["列1"], "タイトル");
    const rule = layout.find((l) => l.kind === "line" && !isDashed(l))!;
    expect(rule).toBeDefined();
    const band = layout.find((l) => l.kind === "polygon" && l.nodeIds.includes("l1"))!;
    expect(rule.width).toBeGreaterThan(band.width); // spans the pyramid column plus the table
  });

  it("handles a row missing its scale/cell children without throwing (defensive, e.g. right after a column is added)", () => {
    const outline = [node("l1", "項目1", [])]; // no children at all
    expect(() => layoutPyramidChart(outline, ["列1"], "")).not.toThrow();
    const layout = layoutPyramidChart(outline, ["列1"], "");
    // Just the band + item-name label, no orphaned scale/cell content.
    expect(layout.filter((l) => l.nodeIds.includes("l1"))).toHaveLength(2);
  });
});
