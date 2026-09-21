import { describe, expect, it } from "vitest";
import { anchorPosition, isPointInsideBox, pickAnchor } from "./connector";
import type { AnchorBox } from "./connector";

describe("anchorPosition", () => {
  it("returns the four side midpoints and center for an unrotated box", () => {
    const box: AnchorBox = { x: 0, y: 0, width: 100, height: 50, rotation: 0 };
    expect(anchorPosition(box, "top")).toEqual({ x: 50, y: 0 });
    expect(anchorPosition(box, "bottom")).toEqual({ x: 50, y: 50 });
    expect(anchorPosition(box, "left")).toEqual({ x: 0, y: 25 });
    expect(anchorPosition(box, "right")).toEqual({ x: 100, y: 25 });
    expect(anchorPosition(box, "center")).toEqual({ x: 50, y: 25 });
  });

  it("rotates the anchor point around the box's center", () => {
    const box: AnchorBox = { x: -50, y: -10, width: 100, height: 20, rotation: 90 };
    const right = anchorPosition(box, "right");
    // Center is (0,0); unrotated "right" is (50, 0). Rotating 90 degrees clockwise
    // (screen-space, y-down) maps (50,0) -> (0, 50).
    expect(right.x).toBeCloseTo(0);
    expect(right.y).toBeCloseTo(50);
  });
});

describe("pickAnchor", () => {
  const box: AnchorBox = { x: 0, y: 0, width: 100, height: 100, rotation: 0 };

  it("picks the horizontal side when the target is further away horizontally", () => {
    expect(pickAnchor(box, { x: 300, y: 60 })).toBe("right");
    expect(pickAnchor(box, { x: -300, y: 60 })).toBe("left");
  });

  it("picks the vertical side when the target is further away vertically", () => {
    expect(pickAnchor(box, { x: 60, y: 300 })).toBe("bottom");
    expect(pickAnchor(box, { x: 60, y: -300 })).toBe("top");
  });
});

describe("isPointInsideBox", () => {
  const box: AnchorBox = { x: 10, y: 10, width: 50, height: 50, rotation: 0 };

  it("is true for points inside (including the boundary)", () => {
    expect(isPointInsideBox(box, { x: 30, y: 30 })).toBe(true);
    expect(isPointInsideBox(box, { x: 10, y: 10 })).toBe(true);
    expect(isPointInsideBox(box, { x: 60, y: 60 })).toBe(true);
  });

  it("is false for points outside", () => {
    expect(isPointInsideBox(box, { x: 9, y: 30 })).toBe(false);
    expect(isPointInsideBox(box, { x: 30, y: 61 })).toBe(false);
  });
});
