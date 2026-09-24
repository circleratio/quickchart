import { describe, expect, it } from "vitest";
import { layoutGridMatrix } from "./gridMatrix";
import type { OutlineNode } from "../model/document";
import { paintOf, fillSlotOf, isDashed } from "./layoutNode";

function node(id: string, text: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text, children };
}

function axes(columns: string[], rows: string[]): OutlineNode[] {
  return [
    node("x", "時間軸", columns.map((c, i) => node(`c${i}`, c))),
    node("y", "現在の事業との近さ", rows.map((r, j) => node(`r${j}`, r))),
  ];
}

const tiles = (layout: ReturnType<typeof layoutGridMatrix>) => layout.filter((l) => l.kind === "rect" && paintOf(l) === "neutral");

describe("layoutGridMatrix", () => {
  it("returns nothing for an empty outline", () => {
    expect(layoutGridMatrix([], "")).toEqual([]);
  });

  it("draws one untracked gray tile per column x row", () => {
    const layout = layoutGridMatrix(axes(["短期", "中期", "長期"], ["遠", "中"]), "");
    const t = tiles(layout);
    expect(t).toHaveLength(6);
    for (const tile of t) expect(tile.nodeIds).toEqual([]);
    expect(new Set(t.map((tile) => tile.x)).size).toBe(3);
    expect(new Set(t.map((tile) => tile.y)).size).toBe(2);
  });

  it("puts column labels below the grid and row labels left of it", () => {
    const layout = layoutGridMatrix(axes(["短期", "長期"], ["遠", "近"]), "");
    const t = tiles(layout);
    const gridLeft = Math.min(...t.map((tile) => tile.x));
    const gridBottom = Math.max(...t.map((tile) => tile.y + tile.height));
    const c0 = layout.find((l) => l.nodeIds[0] === "c0")!;
    const c1 = layout.find((l) => l.nodeIds[0] === "c1")!;
    const r0 = layout.find((l) => l.nodeIds[0] === "r0")!;
    const r1 = layout.find((l) => l.nodeIds[0] === "r1")!;
    expect(c0.y).toBeGreaterThanOrEqual(gridBottom);
    expect(c0.x).toBeLessThan(c1.x);
    expect(r0.x + r0.width).toBeLessThanOrEqual(gridLeft);
    expect(r0.y).toBeLessThan(r1.y);
  });

  it("puts each axis name on a pill, rotating the vertical one to read along it", () => {
    const layout = layoutGridMatrix(axes(["a"], ["b"]), "");
    const xName = layout.find((l) => l.nodeIds[0] === "x")!;
    const yName = layout.find((l) => l.nodeIds[0] === "y")!;
    expect(xName.rotation).toBeUndefined();
    expect(yName.rotation).toBe(-90);

    const pills = layout.filter((l) => l.kind === "rect" && fillSlotOf(l) !== undefined);
    expect(pills).toHaveLength(2);
    const yPill = pills.find((p) => p.height > p.width)!;
    // Rotated around its own center, the name's box lands on the pill's box.
    expect(yName.x + yName.width / 2).toBeCloseTo(yPill.x + yPill.width / 2);
    expect(yName.y + yName.height / 2).toBeCloseTo(yPill.y + yPill.height / 2);
    expect(yName.width).toBeCloseTo(yPill.height);
    expect(yName.height).toBeCloseTo(yPill.width);
  });

  it("adds an underlined title above the grid only when set", () => {
    const without = layoutGridMatrix(axes(["a"], ["b"]), " ");
    const withTitle = layoutGridMatrix(axes(["a"], ["b"]), "日本の製油所の成長");
    expect(without.some((l) => l.kind === "line")).toBe(false);
    const title = withTitle.find((l) => l.text === "日本の製油所の成長")!;
    expect(title.nodeIds).toEqual([]);
    expect(withTitle.some((l) => l.kind === "line" && !isDashed(l))).toBe(true);
    expect(tiles(withTitle)[0].y).toBeGreaterThan(tiles(without)[0].y);
  });
});
