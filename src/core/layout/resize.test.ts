import { describe, expect, it } from "vitest";
import { anchorOffset, computeAnchoredResize, rotateVector } from "./resize";
import type { ResizeBox } from "./resize";

describe("computeAnchoredResize (no rotation)", () => {
  it("grows width by the drag distance when dragging the right handle", () => {
    const start: ResizeBox = { x: 0, y: 0, width: 100, height: 50, rotation: 0 };
    const result = computeAnchoredResize(start, [1, 0], { dx: 40, dy: 0 });
    expect(result.width).toBeCloseTo(140);
    expect(result.x).toBeCloseTo(0);
  });

  it("keeps the right edge fixed when dragging the left handle outward", () => {
    const start: ResizeBox = { x: 50, y: 0, width: 100, height: 50, rotation: 0 };
    const result = computeAnchoredResize(start, [-1, 0], { dx: -30, dy: 0 });
    expect(result.width).toBeCloseTo(130);
    // right edge was at 150, and must stay at 150: 150 - 130 = 20
    expect(result.x).toBeCloseTo(20);
  });

  it("does not change width/x for a vertical-only handle", () => {
    const start: ResizeBox = { x: 10, y: 10, width: 100, height: 50, rotation: 0 };
    const result = computeAnchoredResize(start, [0, 1], { dx: 999, dy: 20 });
    expect(result.width).toBeCloseTo(100);
    expect(result.x).toBeCloseTo(10);
    expect(result.height).toBeCloseTo(70);
  });

  it("clamps to the minimum size instead of collapsing or inverting", () => {
    const start: ResizeBox = { x: 0, y: 0, width: 100, height: 50, rotation: 0 };
    const result = computeAnchoredResize(start, [1, 0], { dx: -500, dy: 0 }, 4);
    expect(result.width).toBe(4);
  });
});

function worldAnchorPoint(box: ResizeBox, direction: [number, number]) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const [rx, ry] = rotateVector(
    anchorOffset(direction[0], box.width) - box.width / 2,
    anchorOffset(direction[1], box.height) - box.height / 2,
    (box.rotation * Math.PI) / 180,
  );
  return { x: cx + rx, y: cy + ry };
}

describe("computeAnchoredResize (rotated)", () => {
  it("keeps the opposite anchor point fixed on screen regardless of rotation", () => {
    const start: ResizeBox = { x: 10, y: 20, width: 100, height: 50, rotation: 37 };
    const direction: [number, number] = [1, 1];
    const before = worldAnchorPoint(start, direction);

    const result = computeAnchoredResize(start, direction, { dx: 30, dy: -10 });
    const after = worldAnchorPoint({ ...result, rotation: start.rotation }, direction);

    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("holds for every handle direction at an arbitrary rotation", () => {
    const start: ResizeBox = { x: -5, y: 15, width: 80, height: 60, rotation: -112 };
    const directions: Array<[number, number]> = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];

    for (const direction of directions) {
      const before = worldAnchorPoint(start, direction);
      const result = computeAnchoredResize(start, direction, { dx: 12, dy: -7 });
      const after = worldAnchorPoint({ ...result, rotation: start.rotation }, direction);
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
    }
  });
});
