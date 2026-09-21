import { describe, expect, it } from "vitest";
import { snapBox, snapPoint, snapValue } from "./snap";

describe("snapValue", () => {
  it("rounds to the nearest grid line", () => {
    expect(snapValue(14, 10)).toBe(10);
    expect(snapValue(16, 10)).toBe(20);
    expect(snapValue(0, 10)).toBe(0);
  });

  it("returns the value unchanged for a non-positive grid size", () => {
    expect(snapValue(13, 0)).toBe(13);
    expect(snapValue(13, -5)).toBe(13);
  });
});

describe("snapPoint", () => {
  it("snaps both axes independently", () => {
    expect(snapPoint({ x: 14, y: 26 }, 10)).toEqual({ x: 10, y: 30 });
  });
});

describe("snapBox", () => {
  it("snaps position and size, clamping size to at least one grid unit", () => {
    expect(snapBox({ x: 14, y: 26, width: 4, height: 96 }, 10)).toEqual({
      x: 10,
      y: 30,
      width: 10,
      height: 100,
    });
  });
});
