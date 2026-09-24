import { describe, expect, it } from "vitest";
import { layoutBulletMatrix } from "./bulletMatrix";
import type { OutlineNode } from "../model/document";
import { fillSlotOf } from "./layoutNode";

function node(id: string, text: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text, children };
}

// A row with `columnCount` empty cells - the shape emptyBulletMatrixRow
// (sync.ts) and the Markdown parser both produce.
function row(id: string, text: string, cells: OutlineNode[]): OutlineNode {
  return node(id, text, cells);
}

function emptyCell(id: string): OutlineNode {
  return node(id, "", []);
}

describe("layoutBulletMatrix", () => {
  it("renders column headers even for an empty outline (no rows yet)", () => {
    const layout = layoutBulletMatrix([], ["企業にとって", "産業社会にとって"]);
    const headings = layout.filter((l) => l.kind === "heading");
    expect(headings).toHaveLength(2);
    expect(headings.every((l) => l.text === "企業にとって" || l.text === "産業社会にとって")).toBe(true);
  });

  it("returns nothing for an empty outline with no columns configured", () => {
    expect(layoutBulletMatrix([], [])).toEqual([]);
  });

  it("places one row-header heading per row and one column-header heading per column", () => {
    const outline = [
      row("r1", "① キャリア開発支援", [emptyCell("a1"), emptyCell("b1")]),
      row("r2", "② パフォーマンスの最大化", [emptyCell("a2"), emptyCell("b2")]),
    ];
    const layout = layoutBulletMatrix(outline, ["企業にとって", "産業社会にとって"]);
    const rowHeadings = layout.filter((l) => l.kind === "heading" && l.nodeIds.includes("r1"));
    const columnHeadings = layout.filter((l) => l.kind === "heading" && l.text === "企業にとって");
    expect(rowHeadings).toHaveLength(1);
    expect(columnHeadings).toHaveLength(1);
  });

  it("row headers sit left of column 0, and column headers sit above row 0 (before normalization)", () => {
    const outline = [row("r1", "行1", [emptyCell("a1")])];
    const layout = layoutBulletMatrix(outline, ["列1"]);
    const rowHeader = layout.find((l) => l.nodeIds.includes("r1"))!;
    const columnHeader = layout.find((l) => l.text === "列1")!;
    expect(columnHeader.x).toBe(rowHeader.width); // column starts right where the row header ends
    expect(columnHeader.y).toBeLessThan(0); // above row 0, until sync.ts normalizes to origin
  });

  it("distinguishes row headers (accent fill) from column headers (a different fill slot)", () => {
    const outline = [row("r1", "行1", [emptyCell("a1")])];
    const layout = layoutBulletMatrix(outline, ["列1"]);
    const rowHeader = layout.find((l) => l.nodeIds.includes("r1"))!;
    const columnHeader = layout.find((l) => l.text === "列1")!;
    expect(fillSlotOf(rowHeader)).toBe("accent");
    expect(fillSlotOf(columnHeader)).not.toBe("accent");
  });

  it("places a title (bold+underlined) and its detail lines (plain) stacked inside their own cell", () => {
    const cell = node("c1", "", [node("t1", "タイトル1", [node("d1", "詳細1"), node("d2", "詳細2")])]);
    const outline = [row("r1", "行1", [cell])];
    const layout = layoutBulletMatrix(outline, ["列1"]);
    const title = layout.find((l) => l.nodeIds.includes("t1"))!;
    const detail1 = layout.find((l) => l.nodeIds.includes("d1"))!;
    const detail2 = layout.find((l) => l.nodeIds.includes("d2"))!;

    expect(title.fontWeight).toBe("bold");
    expect(title.underline).toBe(true);
    expect(title.bulletMarker).toBe("• ");
    expect(detail1.fontWeight).not.toBe("bold");
    expect(detail1.bulletMarker).toBe("- ");

    // Stacked top-down, details indented further right than their title.
    expect(title.y).toBeLessThan(detail1.y);
    expect(detail1.y).toBeLessThan(detail2.y);
    expect(detail1.x).toBeGreaterThan(title.x);
  });

  it("gives a row with more/longer cell content a taller row than one with less", () => {
    const shortCell = node("c1", "", [node("t1", "タイトル", [])]);
    const longCell = node("c2", "", [
      node("t2", "タイトルA", [node("d1", "詳細1"), node("d2", "詳細2"), node("d3", "詳細3")]),
      node("t3", "タイトルB", [node("d4", "詳細1")]),
    ]);
    const outline = [row("r1", "少ない", [shortCell]), row("r2", "多い", [longCell])];
    const layout = layoutBulletMatrix(outline, ["列1"]);
    const h1 = layout.find((l) => l.nodeIds.includes("r1"))!;
    const h2 = layout.find((l) => l.nodeIds.includes("r2"))!;
    expect(h2.height).toBeGreaterThan(h1.height);
  });

  it("places one dashed horizontal separator between rows, none above the first or below the last", () => {
    const outline = [
      row("r1", "行1", [emptyCell("a1")]),
      row("r2", "行2", [emptyCell("a2")]),
      row("r3", "行3", [emptyCell("a3")]),
    ];
    const layout = layoutBulletMatrix(outline, ["列1"]);
    const horizontalLines = layout.filter((l) => l.kind === "line" && l.height === 0);
    expect(horizontalLines).toHaveLength(2);
  });

  it("places one vertical separator per column (row-header|col0, col0|col1, ...), none after the last column", () => {
    const outline = [row("r1", "行1", [emptyCell("a1"), emptyCell("b1")])];
    const layout = layoutBulletMatrix(outline, ["列1", "列2"]);
    const verticalLines = layout.filter((l) => l.kind === "line" && l.width === 0);
    expect(verticalLines).toHaveLength(2);
  });

  it("handles a row with fewer cells than columnHeaders without throwing (defensive, e.g. right after a column is added)", () => {
    const outline = [row("r1", "行1", [emptyCell("a1")])]; // only 1 cell, but 2 columns configured
    expect(() => layoutBulletMatrix(outline, ["列1", "列2"])).not.toThrow();
    const layout = layoutBulletMatrix(outline, ["列1", "列2"]);
    expect(layout.filter((l) => l.nodeIds.includes("r1"))).toHaveLength(1); // just the row heading, no orphaned cell content
  });

  it("aligns cells by position, not text - column 0's cell always lays out under column 0's header regardless of its own (unused) text", () => {
    const cellForCol0 = node("c1", "この文字は使われない", [node("t1", "タイトル")]);
    const outline = [row("r1", "行1", [cellForCol0, emptyCell("c2")])];
    const layout = layoutBulletMatrix(outline, ["列1", "列2"]);
    const title = layout.find((l) => l.nodeIds.includes("t1"))!;
    const col0Header = layout.find((l) => l.text === "列1")!;
    expect(title.x).toBeGreaterThanOrEqual(col0Header.x);
    expect(title.x).toBeLessThan(col0Header.x + col0Header.width);
  });
});
