import { describe, expect, it } from "vitest";
import { layoutChevronFlow } from "./chevronFlow";
import type { OutlineNode } from "../model/document";

function node(id: string, text: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text, children };
}

// A step with its pre-filled duration child (child[0]) followed by bullets -
// the shape a fresh root node (sync.ts) is prefilled with, plus content.
function step(id: string, title: string, duration: string, bullets: OutlineNode[] = []): OutlineNode {
  return node(id, title, [node(`${id}-dur`, duration), ...bullets]);
}

describe("layoutChevronFlow", () => {
  it("returns nothing for an empty outline", () => {
    expect(layoutChevronFlow([])).toEqual([]);
  });

  it("renders a chevron, a body box, an auto-numbered 'Step N', the title, and the duration per step", () => {
    const layout = layoutChevronFlow([step("s1", "初回問い合わせ", "1週間")]);

    const outlines = layout.filter((l) => l.kind === "polygon");
    expect(outlines).toHaveLength(2);
    for (const o of outlines) {
      expect(o.nodeIds).toEqual(["s1"]);
      expect(o.strokeColorSlot).toBeDefined();
    }

    expect(layout.some((l) => l.text === "Step" && l.nodeIds.length === 0)).toBe(true);
    expect(layout.some((l) => l.text === "1" && l.nodeIds.length === 0)).toBe(true);

    const title = layout.find((l) => l.kind === "label" && l.nodeIds[0] === "s1")!;
    expect(title.text).toBe("初回問い合わせ");

    const duration = layout.find((l) => l.nodeIds[0] === "s1-dur")!;
    expect(duration.text).toBe("1週間");
    expect(duration.align).toBe("center");
  });

  it("still renders an empty duration label so it can be typed into later", () => {
    const layout = layoutChevronFlow([step("s1", "本生産", "")]);
    expect(layout.some((l) => l.nodeIds[0] === "s1-dur")).toBe(true);
  });

  it("numbers steps by position and places them left to right", () => {
    const layout = layoutChevronFlow([step("s1", "A", ""), step("s2", "B", ""), step("s3", "C", "")]);
    const numbers = layout.filter((l) => l.nodeIds.length === 0 && /^\d+$/.test(l.text));
    expect(numbers.map((n) => n.text)).toEqual(["1", "2", "3"]);
    expect(numbers[0].x).toBeLessThan(numbers[1].x);
    expect(numbers[1].x).toBeLessThan(numbers[2].x);
  });

  it("marks bullets with '> ' and indents their continuation lines below them", () => {
    const layout = layoutChevronFlow([
      step("s1", "A", "", [node("b1", "データベースから", [node("b1-1", "アイテム毎に工場を選定")]), node("b2", "次の項目")]),
    ]);
    const b1 = layout.find((l) => l.nodeIds[0] === "b1")!;
    const cont = layout.find((l) => l.nodeIds[0] === "b1-1")!;
    const b2 = layout.find((l) => l.nodeIds[0] === "b2")!;

    expect(b1.bulletMarker).toBe("> ");
    expect(cont.bulletMarker).toBeUndefined();
    expect(cont.x).toBeGreaterThan(b1.x);
    expect(cont.y).toBeGreaterThan(b1.y);
    expect(b2.y).toBeGreaterThan(cont.y);
  });

  it("gives every body box the tallest step's height, so durations share one bottom row", () => {
    const manyBullets = Array.from({ length: 20 }, (_, i) => node(`b${i}`, `項目${i}`));
    const layout = layoutChevronFlow([step("s1", "A", "1週間", manyBullets), step("s2", "B", "2週間")]);

    const bodies = layout.filter((l) => l.kind === "polygon" && l.strokeColorSlot === 3);
    expect(bodies).toHaveLength(2);
    expect(bodies[0].height).toBe(bodies[1].height);

    const d1 = layout.find((l) => l.nodeIds[0] === "s1-dur")!;
    const d2 = layout.find((l) => l.nodeIds[0] === "s2-dur")!;
    expect(d1.y).toBe(d2.y);
    const lastBullet = layout.find((l) => l.nodeIds[0] === "b19")!;
    expect(d1.y).toBeGreaterThanOrEqual(lastBullet.y + lastBullet.height);
  });
});
