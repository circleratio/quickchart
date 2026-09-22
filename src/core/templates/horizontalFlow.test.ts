import { describe, expect, it } from "vitest";
import { layoutHorizontalFlow } from "./horizontalFlow";
import type { OutlineNode } from "../model/document";

function node(id: string, text: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text, children };
}

describe("layoutHorizontalFlow", () => {
  it("returns nothing for an empty outline", () => {
    expect(layoutHorizontalFlow([])).toEqual([]);
  });

  it("displays a step's own (root) text as its circle's label", () => {
    const outline = [node("s1", "カジュアル面談")];
    const layout = layoutHorizontalFlow(outline);
    const circle = layout.find((l) => l.kind === "ellipse")!;
    expect(circle.nodeIds).toEqual(["s1"]);
    const label = layout.find((l) => l.kind === "label" && l.nodeIds.includes("s1"))!;
    expect(label.text).toBe("カジュアル面談");
    expect(label.fontWeight).toBe("bold");
  });

  it("a step with no children renders exactly one label line", () => {
    const outline = [node("s1", "最終面接")];
    const layout = layoutHorizontalFlow(outline);
    expect(layout.filter((l) => l.kind === "label")).toHaveLength(1);
  });

  it("stacks a step's children as extra label lines below its own root text", () => {
    const outline = [node("s1", "応募", [node("s1-c0", "書類選考")])];
    const layout = layoutHorizontalFlow(outline);
    const root = layout.find((l) => l.nodeIds.includes("s1"))!;
    const child = layout.find((l) => l.nodeIds.includes("s1-c0"))!;
    expect(child.text).toBe("書類選考");
    expect(child.fontWeight).toBe("bold");
    expect(child.y).toBeGreaterThan(root.y);
  });

  it("places steps left to right", () => {
    const outline = [node("s1", "1"), node("s2", "2")];
    const layout = layoutHorizontalFlow(outline);
    const circle1 = layout.find((l) => l.nodeIds.includes("s1"))!;
    const circle2 = layout.find((l) => l.nodeIds.includes("s2"))!;
    expect(circle2.x).toBeGreaterThan(circle1.x + circle1.width);
  });

  it("the first step's circle is unfilled and dashed; later steps are filled and solid", () => {
    const outline = [node("s1", "1"), node("s2", "2")];
    const layout = layoutHorizontalFlow(outline);
    const circle1 = layout.find((l) => l.kind === "ellipse" && l.nodeIds.includes("s1"))!;
    const circle2 = layout.find((l) => l.kind === "ellipse" && l.nodeIds.includes("s2"))!;
    expect(circle1.fillColorSlot).toBeUndefined();
    expect(circle1.dashed).toBe(true);
    expect(circle2.fillColorSlot).toBe(3);
    expect(circle2.dashed).toBeFalsy();
  });

  it("darkens filled circles going left to right", () => {
    const outline = [node("s1", "1"), node("s2", "2"), node("s3", "3")];
    const layout = layoutHorizontalFlow(outline);
    const circle2 = layout.find((l) => l.kind === "ellipse" && l.nodeIds.includes("s2"))!;
    const circle3 = layout.find((l) => l.kind === "ellipse" && l.nodeIds.includes("s3"))!;
    expect(circle3.fillColorSlot).toBeLessThan(circle2.fillColorSlot as number);
  });

  it("gives filled-circle labels contrastBgColorSlot matching their own circle's fill, and leaves the unfilled first circle's label at the default text color", () => {
    const outline = [node("s1", "1"), node("s2", "2")];
    const layout = layoutHorizontalFlow(outline);
    const circle2 = layout.find((l) => l.kind === "ellipse" && l.nodeIds.includes("s2"))!;
    const label1 = layout.find((l) => l.kind === "label" && l.nodeIds.includes("s1"))!;
    const label2 = layout.find((l) => l.kind === "label" && l.nodeIds.includes("s2"))!;
    expect(label1.contrastBgColorSlot).toBeUndefined();
    expect(label2.contrastBgColorSlot).toBe(circle2.fillColorSlot);
  });

  it("connects consecutive circles with a solid, arrowhead-tipped line, one fewer than the step count", () => {
    const outline = [node("s1", "1"), node("s2", "2"), node("s3", "3")];
    const layout = layoutHorizontalFlow(outline);
    const connectors = layout.filter((l) => l.kind === "line");
    expect(connectors).toHaveLength(2);
    expect(connectors.every((c) => c.arrowhead)).toBe(true);
    expect(connectors.every((c) => c.dashed === false)).toBe(true);
    expect(connectors.every((c) => c.nodeIds.length === 0)).toBe(true);
  });
});
