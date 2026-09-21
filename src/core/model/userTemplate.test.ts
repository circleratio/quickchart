import { describe, expect, it } from "vitest";
import { instantiateTemplate, normalizeShapesForTemplate } from "./userTemplate";
import type { UserTemplate } from "./userTemplate";
import { defaultShapeStyle } from "./style";
import type { Shape } from "./shape";

function rect(id: string, x: number, y: number, groupId?: string): Shape {
  return {
    id,
    type: "rect",
    x,
    y,
    width: 100,
    height: 50,
    rotation: 0,
    style: defaultShapeStyle(),
    zIndex: 0,
    groupId,
  };
}

describe("normalizeShapesForTemplate", () => {
  it("returns an empty array for no shapes", () => {
    expect(normalizeShapesForTemplate([])).toEqual([]);
  });

  it("shifts shapes so the bounding box top-left becomes (0, 0)", () => {
    const shapes = [rect("a", 100, 200), rect("b", 150, 250)];
    const normalized = normalizeShapesForTemplate(shapes);
    const minX = Math.min(...normalized.map((s) => s.x));
    const minY = Math.min(...normalized.map((s) => s.y));
    expect(minX).toBe(0);
    expect(minY).toBe(0);
    // relative offset between the two shapes is preserved
    expect(normalized[1].x - normalized[0].x).toBe(50);
    expect(normalized[1].y - normalized[0].y).toBe(50);
  });
});

describe("instantiateTemplate", () => {
  it("places normalized shapes at an absolute position derived from the drop point", () => {
    const template: UserTemplate = {
      id: "t1",
      name: "test",
      shapes: normalizeShapesForTemplate([rect("a", 100, 200), rect("b", 150, 250)]),
      createdAt: new Date().toISOString(),
    };
    const placed = instantiateTemplate(template, { x: 500, y: 500 }, 10);
    expect(placed[0].x).toBe(500);
    expect(placed[0].y).toBe(500);
    expect(placed[1].x).toBe(550);
    expect(placed[1].y).toBe(550);
  });

  it("round-trips: normalize then instantiate at the original origin reproduces the original layout", () => {
    const original = [rect("a", 37, 84), rect("b", 120, 84), rect("c", 37, 200)];
    const normalized = normalizeShapesForTemplate(original);
    const origin = { x: Math.min(...original.map((s) => s.x)), y: Math.min(...original.map((s) => s.y)) };
    const template: UserTemplate = { id: "t1", name: "t", shapes: normalized, createdAt: "2026-01-01T00:00:00.000Z" };
    const placed = instantiateTemplate(template, origin, 0);

    for (let i = 0; i < original.length; i++) {
      expect(placed[i].x).toBe(original[i].x);
      expect(placed[i].y).toBe(original[i].y);
    }
  });

  it("assigns fresh distinct ids and strips templateNodeIds", () => {
    const template: UserTemplate = {
      id: "t1",
      name: "t",
      shapes: [{ ...rect("a", 0, 0), templateNodeIds: ["stale-node"] }],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const placed = instantiateTemplate(template, { x: 0, y: 0 }, 0);
    expect(placed[0].id).not.toBe("a");
    expect(placed[0].templateNodeIds).toBeUndefined();
  });

  it("gives shapes that shared a groupId a new shared groupId, distinct per placement", () => {
    const template: UserTemplate = {
      id: "t1",
      name: "t",
      shapes: [rect("a", 0, 0, "g1"), rect("b", 20, 0, "g1")],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const placed1 = instantiateTemplate(template, { x: 0, y: 0 }, 0);
    const placed2 = instantiateTemplate(template, { x: 100, y: 0 }, 0);

    expect(placed1[0].groupId).toBeDefined();
    expect(placed1[0].groupId).toBe(placed1[1].groupId);
    expect(placed2[0].groupId).toBe(placed2[1].groupId);
    expect(placed1[0].groupId).not.toBe(placed2[0].groupId);
  });
});
