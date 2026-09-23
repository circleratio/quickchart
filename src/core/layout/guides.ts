import type { Box } from "./snap";

// A guide drawn while dragging (doc/spec.md §5.3), in canvas coordinates:
// axis "x" is a vertical line at x = position spanning y from..to, axis "y" a
// horizontal line at y = position spanning x from..to.
export interface GuideLine {
  axis: "x" | "y";
  position: number;
  from: number;
  to: number;
}

export interface AlignmentGuideResult {
  // Correction to add to the moving box so it lands exactly on the guide
  // (0 on an axis where nothing was close enough - see snappedX/snappedY).
  dx: number;
  dy: number;
  snappedX: boolean;
  snappedY: boolean;
  lines: GuideLine[];
}

// Rounding slack when deciding which other boxes share the chosen guide
// position, so float noise doesn't hide an exact alignment.
const EPSILON = 0.01;

// A box may carry a negative width/height (a plain line drawn up/left), so
// normalize to min/max edges first.
function normalize(box: Box): Box {
  return {
    x: Math.min(box.x, box.x + box.width),
    y: Math.min(box.y, box.y + box.height),
    width: Math.abs(box.width),
    height: Math.abs(box.height),
  };
}

function xRefs(box: Box): number[] {
  return [box.x, box.x + box.width / 2, box.x + box.width];
}

function yRefs(box: Box): number[] {
  return [box.y, box.y + box.height / 2, box.y + box.height];
}

// Finds, for one axis, the smallest correction within `threshold` that makes
// one of the moving box's three reference lines (start/center/end) coincide
// with one of another box's. Returns null when nothing is close enough.
function bestSnap(movingRefs: number[], others: Box[], refsOf: (box: Box) => number[], threshold: number) {
  let best: { delta: number; position: number } | null = null;
  for (const other of others) {
    for (const target of refsOf(other)) {
      for (const ref of movingRefs) {
        const delta = target - ref;
        if (Math.abs(delta) > threshold) continue;
        if (best === null || Math.abs(delta) < Math.abs(best.delta)) best = { delta, position: target };
      }
    }
  }
  return best;
}

// One line along the chosen position, long enough to cover the moving box and
// every other box aligned to that same position.
function guideLine(
  axis: "x" | "y",
  position: number,
  moving: Box,
  others: Box[],
): GuideLine {
  const refsOf = axis === "x" ? xRefs : yRefs;
  const spanStart = (box: Box) => (axis === "x" ? box.y : box.x);
  const spanEnd = (box: Box) => (axis === "x" ? box.y + box.height : box.x + box.width);
  const aligned = others.filter((other) => refsOf(other).some((ref) => Math.abs(ref - position) < EPSILON));
  const boxes = [moving, ...aligned];
  return {
    axis,
    position,
    from: Math.min(...boxes.map(spanStart)),
    to: Math.max(...boxes.map(spanEnd)),
  };
}

// Computes alignment guides for a box being dragged against the other shapes
// on the canvas (doc/spec.md §5.3). Each axis snaps independently: left/
// center/right edges on x, top/middle/bottom on y.
export function computeAlignmentGuides(moving: Box, others: Box[], threshold: number): AlignmentGuideResult {
  const movingBox = normalize(moving);
  const otherBoxes = others.map(normalize);

  const snapX = bestSnap(xRefs(movingBox), otherBoxes, xRefs, threshold);
  const snapY = bestSnap(yRefs(movingBox), otherBoxes, yRefs, threshold);
  const dx = snapX?.delta ?? 0;
  const dy = snapY?.delta ?? 0;
  const snapped: Box = { ...movingBox, x: movingBox.x + dx, y: movingBox.y + dy };

  const lines: GuideLine[] = [];
  if (snapX) lines.push(guideLine("x", snapX.position, snapped, otherBoxes));
  if (snapY) lines.push(guideLine("y", snapY.position, snapped, otherBoxes));
  return { dx, dy, snappedX: snapX !== null, snappedY: snapY !== null, lines };
}

// Bounding box of several boxes (the whole drag selection moves as one unit).
export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const normalized = boxes.map(normalize);
  const minX = Math.min(...normalized.map((b) => b.x));
  const minY = Math.min(...normalized.map((b) => b.y));
  const maxX = Math.max(...normalized.map((b) => b.x + b.width));
  const maxY = Math.max(...normalized.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
