import { describe, expect, it } from "vitest";
import {
  alignBottom,
  alignCenterHorizontal,
  alignCenterVertical,
  alignLeft,
  alignRight,
  alignTop,
  distributeHorizontally,
  distributeVertically,
} from "./align";
import type { AlignBox } from "./align";

const boxes: AlignBox[] = [
  { id: "a", x: 0, y: 0, width: 100, height: 50 },
  { id: "b", x: 50, y: 100, width: 40, height: 40 },
  { id: "c", x: 200, y: 300, width: 20, height: 20 },
];

describe("align (fewer than 2 boxes)", () => {
  it("returns no patch when only one box is given", () => {
    expect(alignLeft([boxes[0]])).toEqual({});
  });
});

describe("alignLeft / alignRight", () => {
  it("aligns to the leftmost x", () => {
    const patch = alignLeft(boxes);
    expect(patch.a.x).toBe(0);
    expect(patch.b.x).toBe(0);
    expect(patch.c.x).toBe(0);
  });

  it("aligns to the rightmost edge", () => {
    const patch = alignRight(boxes);
    // rightmost edge among boxes is c: 200 + 20 = 220
    expect(patch.a.x).toBe(220 - 100);
    expect(patch.b.x).toBe(220 - 40);
    expect(patch.c.x).toBe(220 - 20);
  });
});

describe("alignTop / alignBottom", () => {
  it("aligns to the topmost y", () => {
    const patch = alignTop(boxes);
    expect(patch.a.y).toBe(0);
    expect(patch.b.y).toBe(0);
    expect(patch.c.y).toBe(0);
  });

  it("aligns to the bottommost edge", () => {
    const patch = alignBottom(boxes);
    // bottommost edge among boxes is c: 300 + 20 = 320
    expect(patch.a.y).toBe(320 - 50);
    expect(patch.b.y).toBe(320 - 40);
    expect(patch.c.y).toBe(320 - 20);
  });
});

describe("alignCenterHorizontal / alignCenterVertical", () => {
  it("centers all boxes on the average horizontal center", () => {
    const patch = alignCenterHorizontal(boxes);
    const centers = boxes.map((b) => patch[b.id].x! + b.width / 2);
    expect(centers[0]).toBeCloseTo(centers[1]);
    expect(centers[1]).toBeCloseTo(centers[2]);
  });

  it("centers all boxes on the average vertical center", () => {
    const patch = alignCenterVertical(boxes);
    const centers = boxes.map((b) => patch[b.id].y! + b.height / 2);
    expect(centers[0]).toBeCloseTo(centers[1]);
    expect(centers[1]).toBeCloseTo(centers[2]);
  });
});

describe("distributeHorizontally / distributeVertically", () => {
  it("does nothing for fewer than 3 boxes", () => {
    expect(distributeHorizontally(boxes.slice(0, 2))).toEqual({});
  });

  it("spaces boxes with equal gaps between edges", () => {
    const patch = distributeHorizontally(boxes);
    const sorted = [...boxes].sort((a, b) => a.x - b.x);
    const gap1 = patch[sorted[1].id].x! - (patch[sorted[0].id].x! + sorted[0].width);
    const gap2 = patch[sorted[2].id].x! - (patch[sorted[1].id].x! + sorted[1].width);
    expect(gap1).toBeCloseTo(gap2);
  });

  it("keeps the first and last box positions fixed", () => {
    const sorted = [...boxes].sort((a, b) => a.x - b.x);
    const patch = distributeHorizontally(boxes);
    expect(patch[sorted[0].id].x).toBeCloseTo(sorted[0].x);
    expect(patch[sorted[sorted.length - 1].id].x).toBeCloseTo(sorted[sorted.length - 1].x);
  });

  it("spaces boxes vertically with equal gaps", () => {
    const patch = distributeVertically(boxes);
    const sorted = [...boxes].sort((a, b) => a.y - b.y);
    const gap1 = patch[sorted[1].id].y! - (patch[sorted[0].id].y! + sorted[0].height);
    const gap2 = patch[sorted[2].id].y! - (patch[sorted[1].id].y! + sorted[1].height);
    expect(gap1).toBeCloseTo(gap2);
  });
});
