import { describe, expect, it } from "vitest";
import { layoutBeforeAfterHorizontal } from "./beforeAfterHorizontal";
import type { OutlineNode } from "../model/document";

function node(id: string, text: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text, children };
}

// A row with pre-filled "before"/"after" groups - the shape a fresh root
// node (sync.ts) is prefilled with. Each group's own text is its first
// bullet item; any further items are its children.
function row(id: string, heading: string, beforeItems: string[], afterItems: string[]): OutlineNode {
  return node(id, heading, [
    node(`${id}-before`, beforeItems[0] ?? "", beforeItems.slice(1).map((t, i) => node(`${id}-b${i}`, t))),
    node(`${id}-after`, afterItems[0] ?? "", afterItems.slice(1).map((t, i) => node(`${id}-a${i}`, t))),
  ]);
}

describe("layoutBeforeAfterHorizontal", () => {
  it("returns just the two column headers for an empty outline", () => {
    const layout = layoutBeforeAfterHorizontal([], "考慮すべき機会", "展開戦略");
    expect(layout.some((l) => l.text === "考慮すべき機会")).toBe(true);
    expect(layout.some((l) => l.text === "展開戦略")).toBe(true);
    expect(layout.some((l) => l.kind === "heading")).toBe(false);
  });

  it("renders one heading cell per row, plus the group's own text as the first bullet item in both columns", () => {
    const outline = [row("r1", "冷凍食品の強化", ["冷凍食品は市場規模が今後も拡大"], ["海外における冷凍食品の取り扱い強化"])];
    const layout = layoutBeforeAfterHorizontal(outline, "考慮すべき機会", "展開戦略");

    const heading = layout.find((l) => l.kind === "heading")!;
    expect(heading.text).toBe("冷凍食品の強化");
    expect(heading.nodeIds).toEqual(["r1"]);

    const before = layout.find((l) => l.nodeIds.includes("r1-before"))!;
    expect(before.text).toBe("冷凍食品は市場規模が今後も拡大");
    expect(before.bulletMarker).toBe("• ");

    const after = layout.find((l) => l.nodeIds.includes("r1-after"))!;
    expect(after.text).toBe("海外における冷凍食品の取り扱い強化");
    expect(after.bulletMarker).toBe("• ");
    expect(after.x).toBeGreaterThan(before.x);
  });

  it("stacks a group's own text (first item) and its children (remaining items) top to bottom", () => {
    const outline = [row("r1", "見出し", ["1", "2", "3"], [])];
    const layout = layoutBeforeAfterHorizontal(outline, "", "");
    const b0 = layout.find((l) => l.nodeIds.includes("r1-before"))!;
    const b1 = layout.find((l) => l.nodeIds.includes("r1-b0"))!;
    const b2 = layout.find((l) => l.nodeIds.includes("r1-b1"))!;
    expect(b0.text).toBe("1");
    expect(b1.text).toBe("2");
    expect(b2.text).toBe("3");
    expect(b1.y).toBeGreaterThan(b0.y);
    expect(b2.y).toBeGreaterThan(b1.y);
    expect(b1.bulletMarker).toBe("• ");
  });

  it("stacks rows top to bottom", () => {
    const outline = [row("r1", "1", [], []), row("r2", "2", [], [])];
    const layout = layoutBeforeAfterHorizontal(outline, "", "");
    const h1 = layout.find((l) => l.nodeIds.includes("r1"))!;
    const h2 = layout.find((l) => l.nodeIds.includes("r2"))!;
    expect(h2.y).toBeGreaterThan(h1.y);
  });

  it("gives a row's height room for whichever of before/after has more items", () => {
    const outline = [row("r1", "短い", ["1"], ["1", "2", "3"])];
    const layout = layoutBeforeAfterHorizontal(outline, "", "");
    const heading = layout.find((l) => l.kind === "heading")!;
    const lastAfterItem = layout.find((l) => l.nodeIds.includes("r1-a1"))!;
    expect(lastAfterItem.y + lastAfterItem.height).toBeLessThanOrEqual(heading.y + heading.height + 1);
  });

  it("draws one neutral-gray, right-pointing filled arrow between the two columns per row", () => {
    const outline = [row("r1", "1", [], []), row("r2", "2", [], [])];
    const layout = layoutBeforeAfterHorizontal(outline, "", "");
    const arrows = layout.filter((l) => l.kind === "polygon");
    expect(arrows).toHaveLength(2);
    expect(arrows.every((a) => a.neutralFill)).toBe(true);
    expect(arrows.every((a) => a.nodeIds.length === 0)).toBe(true);
    // Right-pointing: the far vertex sits at x fraction 1, midway down (y 0.5).
    expect(arrows[0].points?.[2]).toEqual({ x: 1, y: 0.5 });
  });

  it("draws a dashed row separator between rows but not above the first or below the last", () => {
    const outline = [row("r1", "1", [], []), row("r2", "2", [], []), row("r3", "3", [], [])];
    const layout = layoutBeforeAfterHorizontal(outline, "", "");
    const separators = layout.filter((l) => l.kind === "line" && l.dashed !== false);
    expect(separators).toHaveLength(2);
  });

  it("draws each column header's own underline spanning just that column, not the row-header column", () => {
    const outline = [row("r1", "1", [], [])];
    const layout = layoutBeforeAfterHorizontal(outline, "", "");
    const rules = layout.filter((l) => l.kind === "line" && l.dashed === false);
    expect(rules).toHaveLength(2);
    expect(rules[0].x).toBeGreaterThan(0); // starts after the row-header column
    expect(rules[1].x).toBeGreaterThan(rules[0].x + rules[0].width); // after the before column + arrow gap
  });

  it("handles a row missing its before/after groups without throwing (defensive)", () => {
    const outline = [node("r1", "見出しのみ", [])];
    expect(() => layoutBeforeAfterHorizontal(outline, "", "")).not.toThrow();
  });
});
