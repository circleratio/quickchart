import type { OutlineNode } from "../model/document";
import type { LayoutNode } from "./treeLayout";

const CIRCLE_RADIUS_2 = 140;
const CIRCLE_RADIUS_3 = 130;
const ITEM_WIDTH = 110;
const ITEM_HEIGHT = 28;
const ITEM_GAP = 4;
// Wider/taller than an item box since the set label uses a larger font (see
// LABEL_FONT_SIZE below).
const LABEL_WIDTH = 130;
const LABEL_HEIGHT = 36;
// Larger than labelStyle()'s own default (a regular item label's 16px) since
// the set name reads as a title, not a regular item.
const LABEL_FONT_SIZE = 20;
// How far a set's label sits from its circle's center, as a fraction of the
// radius, in the outward direction (see the label placement loop below) -
// close to the center so the label reads as "inside this circle" rather than
// hugging the boundary, but still offset toward its own exclusive area so it
// doesn't sit exactly on the overlap seam with the other circle(s).
const LABEL_INSET_FRACTION = 0.4;

export const VENN_MIN_SETS = 2;
export const VENN_MAX_SETS = 3;

interface Circle {
  cx: number;
  cy: number;
  r: number;
}

// Fixed circle layouts for 2 and 3 sets (doc/spec.md §6.2.2). Index order
// matches outline root order (set A, set B, [set C]).
function circlesFor(setCount: number): Circle[] {
  if (setCount <= 2) {
    return [
      { cx: -70, cy: 0, r: CIRCLE_RADIUS_2 },
      { cx: 70, cy: 0, r: CIRCLE_RADIUS_2 },
    ];
  }
  return [
    { cx: -75, cy: -60, r: CIRCLE_RADIUS_3 },
    { cx: 75, cy: -60, r: CIRCLE_RADIUS_3 },
    { cx: 0, cy: 80, r: CIRCLE_RADIUS_3 },
  ];
}

function centroidOf(circles: Circle[]): { x: number; y: number } {
  const sum = circles.reduce((acc, c) => ({ x: acc.x + c.cx, y: acc.y + c.cy }), { x: 0, y: 0 });
  return { x: sum.x / circles.length, y: sum.y / circles.length };
}

// Unit vector from the overall centroid of every circle toward circle i's own
// center, extended - i.e. the direction that points from the middle of the
// whole diagram straight through that circle's center and on into its own
// exclusive area. Shared by representativePoint's single-set bias and the set
// label placement below, so both sit on the same line through the circle's
// center for a given circle, keeping the layout symmetric.
function outwardDirection(circles: Circle[], index: number): { x: number; y: number } {
  const c = circles[index];
  const centroid = centroidOf(circles);
  const dx = c.cx - centroid.x;
  const dy = c.cy - centroid.y;
  const dist = Math.hypot(dx, dy) || 1;
  return { x: dx / dist, y: dy / dist };
}

// Representative point for a combination of set indices: the mean of the
// involved circles' centers for an intersection, or a point biased into that
// circle's own exclusive area (away from the overall centroid) for a
// single-set-only element. An approximation adequate for our fixed 2/3-circle
// layouts, not a true geometric centroid of the overlap region.
function representativePoint(circles: Circle[], indices: number[]): { x: number; y: number } {
  if (indices.length === 1) {
    const c = circles[indices[0]];
    const dir = outwardDirection(circles, indices[0]);
    const bias = c.r * 0.5;
    return { x: c.cx + dir.x * bias, y: c.cy + dir.y * bias };
  }
  const sum = indices.reduce((acc, i) => ({ x: acc.x + circles[i].cx, y: acc.y + circles[i].cy }), { x: 0, y: 0 });
  return { x: sum.x / indices.length, y: sum.y / indices.length };
}

interface ElementGroup {
  text: string;
  nodeIds: string[];
  setIndices: Set<number>;
}

// 2-3 sets max (doc/spec.md §6.2.2); extra roots are defensively ignored here
// too, same as matrix.ts, even though the UI ties root count to
// params.setCount.
export function layoutVenn(outline: OutlineNode[], setCount: number): LayoutNode[] {
  const sets = outline.slice(0, Math.max(VENN_MIN_SETS, Math.min(VENN_MAX_SETS, setCount)));
  const circles = circlesFor(sets.length);
  const result: LayoutNode[] = [];

  // Circle outlines first, so they get a lower zIndex than every label and
  // render underneath them (see regenerateBlockShapes in sync.ts).
  sets.forEach((set, i) => {
    const c = circles[i];
    result.push({
      nodeIds: [set.id],
      text: "",
      depth: 0,
      x: c.cx - c.r,
      y: c.cy - c.r,
      width: c.r * 2,
      height: c.r * 2,
      kind: "ellipse",
    });
  });

  // A set label sits on the line from the diagram's overall center through
  // its own circle's center, extended out into that circle's exclusive area -
  // the same line single-set-only elements are biased along (representativePoint
  // above), just closer to the center. Keeping both on that one line, rather
  // than only offsetting vertically, is what keeps the layout symmetric for
  // circles whose center is offset diagonally from the overall center (e.g.
  // the two top circles in the 3-circle layout). Rendered borderless (kind:
  // "label") since it's a caption on top of the circle, not its own layer.
  sets.forEach((set, i) => {
    const c = circles[i];
    const dir = outwardDirection(circles, i);
    const labelCenterX = c.cx + dir.x * c.r * LABEL_INSET_FRACTION;
    const labelCenterY = c.cy + dir.y * c.r * LABEL_INSET_FRACTION;
    result.push({
      nodeIds: [set.id],
      text: set.text,
      depth: 0,
      x: labelCenterX - LABEL_WIDTH / 2,
      y: labelCenterY - LABEL_HEIGHT / 2,
      width: LABEL_WIDTH,
      height: LABEL_HEIGHT,
      kind: "label",
      fontSize: LABEL_FONT_SIZE,
    });
  });

  // Group elements by exact text match (doc/spec.md §6.2.2's rule for which
  // elements are "the same"). An empty label is never merged with another
  // empty one - each freshly-added, not-yet-typed element stays its own group.
  const groups = new Map<string, ElementGroup>();
  sets.forEach((set, setIndex) => {
    for (const element of set.children) {
      const key = element.text.trim() === "" ? `__empty_${element.id}` : element.text;
      const existing = groups.get(key);
      if (existing) {
        existing.nodeIds.push(element.id);
        existing.setIndices.add(setIndex);
      } else {
        groups.set(key, { text: element.text, nodeIds: [element.id], setIndices: new Set([setIndex]) });
      }
    }
  });

  // Bucket groups sharing the same combination-of-sets so they stack instead
  // of overlapping at the same representative point.
  const byCombination = new Map<string, ElementGroup[]>();
  for (const group of groups.values()) {
    const key = [...group.setIndices].sort().join(",");
    const bucket = byCombination.get(key);
    if (bucket) bucket.push(group);
    else byCombination.set(key, [group]);
  }

  for (const [key, bucket] of byCombination) {
    const indices = key.split(",").map(Number);
    const point = representativePoint(circles, indices);
    const totalHeight = bucket.length * (ITEM_HEIGHT + ITEM_GAP) - ITEM_GAP;
    const startY = point.y - totalHeight / 2;
    bucket.forEach((group, i) => {
      result.push({
        nodeIds: group.nodeIds,
        text: group.text,
        depth: 1,
        x: point.x - ITEM_WIDTH / 2,
        y: startY + i * (ITEM_HEIGHT + ITEM_GAP),
        width: ITEM_WIDTH,
        height: ITEM_HEIGHT,
      });
    });
  }

  return result;
}
