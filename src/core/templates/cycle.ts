import type { OutlineNode } from "../model/document";
import type { Point } from "../model/shape";
import type { ThemeColorSlot } from "../model/style";
import { fixedText, shapeNode, textNode } from "./layoutNode";
import type { LayoutNode } from "./layoutNode";
import { polygonFromAbsolute } from "./parts/polygon";
import { TITLE_EDITOR, stringParam } from "./patternDefinition";
import type { PatternDefinition } from "./patternDefinition";

// Ring geometry. The ring's center is (CENTER_X, CENTER_Y) in layout
// coordinates; sync.ts's normalizeToOrigin shifts the whole block so its
// top-left lands at (0, 0) afterwards, so these only need to be consistent
// with each other.
const R_OUT = 250;
const R_IN = 110;
const R_MID = (R_OUT + R_IN) / 2;
const BAND = R_OUT - R_IN;
const CENTER_X = 0;
const CENTER_Y = 0;
// Arc length (at R_MID) of an arrow's pointed head, and of its tail's notch
// that the previous arrow's head points into.
const HEAD_LEN = 36;
// How far an arrow's head flares out past the band on each side.
const HEAD_FLARE = 14;
// Arc length (at R_MID) left between one arrow's tip and the next arrow's
// notch.
const SEGMENT_GAP = 8;
// Max angle between two sampled points of an arc edge.
const ARC_STEP = (4 * Math.PI) / 180;

const LABEL_WIDTH = 150;
const LINE_HEIGHT = 22;
const LABEL_FONT_SIZE = 15;
const TITLE_WIDTH = 2 * R_IN * 0.85;
const TITLE_HEIGHT = 40;
const TITLE_FONT_SIZE = 20;

// cycleWithEntry: the loop starts with a straight arrow along the ring's top
// band (from the ring's left edge to its top center), and a separate entry
// arrow of the same height leads into it from the left. The curved part of
// the loop then only spans from the top center clockwise to ARC_END, where
// the last arrow points up into the straight arrow's underside (the
// reference image's layout).
const ARC_START = -Math.PI / 2;
const ARC_END_WITH_ENTRY = (200 * Math.PI) / 180;
const STRAIGHT_START_X = CENTER_X - R_OUT - HEAD_FLARE;
const ENTRY_LENGTH = 300;
const ENTRY_PADDING_X = 16;
const ENTRY_HEADING_FONT_SIZE = 16;
const BULLET_MARKER = "• ";
const CONTINUATION_INDENT = 16;

// Loop arrows in the first half of the cycle use a pale shade, the rest a
// dark one - the reference image's "returning" arrows are the darker ones.
const LIGHT_SLOT: ThemeColorSlot = 3;
const DARK_SLOT: ThemeColorSlot = 1;

function polar(angle: number, radius: number): Point {
  return { x: CENTER_X + radius * Math.cos(angle), y: CENTER_Y + radius * Math.sin(angle) };
}

// Samples an arc from `from` to `to` (either direction), both ends included.
function arc(from: number, to: number, radius: number): Point[] {
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / ARC_STEP));
  return Array.from({ length: steps + 1 }, (_, k) => polar(from + ((to - from) * k) / steps, radius));
}

function polygonNode(node: OutlineNode, abs: Point[], fillSlot: ThemeColorSlot): LayoutNode {
  return shapeNode(node, { ...polygonFromAbsolute(abs), paint: { fill: fillSlot } });
}

// An arrow's pointed head: its two flared base corners, its tip, and the
// direction it points in at the tip.
interface Head {
  outer: Point;
  tip: Point;
  inner: Point;
  dir: Point;
}

// The V-shaped notch in an arrow's tail that the previous arrow's head points
// into: where its two edges meet the band's outer/inner boundary, and its
// apex.
interface Notch {
  outer: Point;
  apex: Point;
  inner: Point;
}

const TOP_Y = CENTER_Y - R_OUT;
const BOTTOM_Y = CENTER_Y - R_IN;
const MID_Y = CENTER_Y - R_MID;

function arcHead(end: number, head: number): Head {
  return {
    outer: polar(end - head, R_OUT + HEAD_FLARE),
    tip: polar(end, R_MID),
    inner: polar(end - head, R_IN - HEAD_FLARE),
    dir: { x: -Math.sin(end), y: Math.cos(end) },
  };
}

function straightHead(tipX: number): Head {
  const baseX = tipX - HEAD_LEN;
  return {
    outer: { x: baseX, y: TOP_Y - HEAD_FLARE },
    tip: { x: tipX, y: MID_Y },
    inner: { x: baseX, y: BOTTOM_Y + HEAD_FLARE },
    dir: { x: 1, y: 0 },
  };
}

// Where the ray from `from` along `toward - from`'s direction meets the band
// boundary `hit`, given as a function returning the ray parameter.
function along(from: Point, toward: Point, hit: (from: Point, u: Point) => number): Point {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const len = Math.hypot(dx, dy);
  const u = { x: dx / len, y: dy / len };
  const t = hit(from, u);
  return { x: from.x + u.x * t, y: from.y + u.y * t };
}

// Ray/circle intersection around the ring's center; `outward` picks the far
// root (leaving the circle from inside) instead of the near one (entering it
// from outside).
function circleHit(radius: number, outward: boolean) {
  return (from: Point, u: Point): number => {
    const dx = from.x - CENTER_X;
    const dy = from.y - CENTER_Y;
    const b = dx * u.x + dy * u.y;
    const c = dx * dx + dy * dy - radius * radius;
    const disc = Math.max(0, b * b - c);
    return outward ? -b + Math.sqrt(disc) : -b - Math.sqrt(disc);
  };
}

function horizontalHit(y: number) {
  return (from: Point, u: Point): number => (y - from.y) / u.y;
}

// The notch that `prev`'s head nests into: the head's own edges shifted
// SEGMENT_GAP-ish forward along its pointing direction, so each notch edge
// runs exactly parallel to the head edge facing it (the gap between them
// stays even instead of the two outlines crossing).
function notchFor(prev: Head, gap: number, curved: boolean): Notch {
  const apex = { x: prev.tip.x + prev.dir.x * gap, y: prev.tip.y + prev.dir.y * gap };
  const outerEnd = { x: apex.x + prev.outer.x - prev.tip.x, y: apex.y + prev.outer.y - prev.tip.y };
  const innerEnd = { x: apex.x + prev.inner.x - prev.tip.x, y: apex.y + prev.inner.y - prev.tip.y };
  return {
    outer: along(apex, outerEnd, curved ? circleHit(R_OUT, true) : horizontalHit(TOP_Y)),
    apex,
    inner: along(apex, innerEnd, curved ? circleHit(R_IN, false) : horizontalHit(BOTTOM_Y)),
  };
}

// atan2 of `p` around the ring's center, unwrapped to lie within half a turn
// of `near`.
function angleNear(p: Point, near: number): number {
  const a = Math.atan2(p.y - CENTER_Y, p.x - CENTER_X);
  return a + 2 * Math.PI * Math.round((near - a) / (2 * Math.PI));
}

// A curved arrow along the ring: its tail notched by `notch` near angle
// `start`, its tip at angle `end`, clockwise. `head` is the head's angular
// depth.
function arcArrowPoints(start: number, end: number, head: number, notch: Notch): Point[] {
  const h = arcHead(end, head);
  return [
    ...arc(angleNear(notch.outer, start), end - head, R_OUT),
    h.outer,
    h.tip,
    h.inner,
    ...arc(end - head, angleNear(notch.inner, start), R_IN),
    notch.apex,
  ];
}

// A rightward arrow on the ring's top band: tail at x `startX` (notched by
// `notch` when given, flat otherwise), tip at x `tipX`.
function straightArrowPoints(startX: number, tipX: number, notch?: Notch): Point[] {
  const h = straightHead(tipX);
  const baseX = tipX - HEAD_LEN;
  return [
    notch ? notch.outer : { x: startX, y: TOP_Y },
    { x: baseX, y: TOP_Y },
    h.outer,
    h.tip,
    h.inner,
    { x: baseX, y: BOTTOM_Y },
    ...(notch ? [notch.inner, notch.apex] : [{ x: startX, y: BOTTOM_Y }]),
  ];
}

// A loop step's own text followed by all of its descendants, one line each
// (no wrapping - same "one line per node" constraint as every other pattern,
// doc/spec.md §6.1).
function stepLines(step: OutlineNode): OutlineNode[] {
  const lines: OutlineNode[] = [];
  const visit = (n: OutlineNode) => {
    lines.push(n);
    n.children.forEach(visit);
  };
  visit(step);
  return lines;
}

// Stacks a loop step's lines as centered labels around (cx, cy).
function stepLabels(step: OutlineNode, cx: number, cy: number, width: number, bgSlot: ThemeColorSlot): LayoutNode[] {
  const lines = stepLines(step);
  const top = cy - (lines.length * LINE_HEIGHT) / 2;
  return lines.map((line, k) => textNode(line, line === step ? 0 : 1, {
    x: cx - width / 2,
    y: top + k * LINE_HEIGHT,
    width,
    height: LINE_HEIGHT,
    kind: "label",
    align: "center",
    fontSize: LABEL_FONT_SIZE,
    contrastBgColorSlot: bgSlot,
  }));
}

// The entry arrow's heading line, "• " bullets (its children) and their
// continuation lines (grandchildren), left-aligned and vertically centered in
// the band.
function entryLabels(entry: OutlineNode, left: number, width: number): LayoutNode[] {
  const lineCount = 1 + entry.children.reduce((sum, b) => sum + 1 + b.children.length, 0);
  let y = CENTER_Y - R_MID - (lineCount * LINE_HEIGHT) / 2;
  const common = { kind: "label" as const, align: "left" as const, height: LINE_HEIGHT, contrastBgColorSlot: LIGHT_SLOT };
  const result: LayoutNode[] = [
    textNode(entry, 0, { ...common, x: left, y, width, fontSize: ENTRY_HEADING_FONT_SIZE }),
  ];
  y += LINE_HEIGHT;
  for (const bullet of entry.children) {
    result.push(textNode(bullet, 1, { ...common, x: left, y, width, fontSize: LABEL_FONT_SIZE, bulletMarker: BULLET_MARKER }));
    y += LINE_HEIGHT;
    for (const line of bullet.children) {
      result.push(textNode(line, 2, {
        ...common,
        x: left + CONTINUATION_INDENT,
        y,
        width: width - CONTINUATION_INDENT,
        fontSize: LABEL_FONT_SIZE,
      }));
      y += LINE_HEIGHT;
    }
  }
  return result;
}

// "サイクル図" (doc/spec.md §6.2.15): a ring of curved block arrows, each
// pointing into the next, with an optional title in the middle
// (params.title). Root outline nodes are the loop's steps, clockwise from the
// top; a step's own text and its descendants are the arrow's lines.
//
// withEntry = true ("導入部あり"): root[0] is instead an entry arrow leading
// in from the top left (its children are "• " bullets, grandchildren their
// continuation lines), root[1] is a straight arrow along the ring's top band,
// and root[2..] are the curved arrows, the last of which points back up into
// root[1].
export function layoutCycle(outline: OutlineNode[], title: string, withEntry: boolean): LayoutNode[] {
  const shapes: LayoutNode[] = [];
  const labels: LayoutNode[] = [];

  const entry = withEntry ? outline[0] : undefined;
  const loop = withEntry ? outline.slice(1) : outline;
  const straight = withEntry ? loop[0] : undefined;
  const arcs = withEntry ? loop.slice(1) : loop;
  const slotFor = (loopIndex: number): ThemeColorSlot => (loopIndex >= Math.ceil(loop.length / 2) ? DARK_SLOT : LIGHT_SLOT);

  const span = withEntry ? ARC_END_WITH_ENTRY - ARC_START : 2 * Math.PI;
  const step = arcs.length > 0 ? span / arcs.length : span;
  // Keep the head and notch from eating a short arrow's whole body.
  const head = Math.min(HEAD_LEN / R_MID, step * 0.35);
  const gap = Math.min(SEGMENT_GAP / R_MID, step * 0.1);

  // The head each arrow's tail notch is cut to fit, carried forward as the
  // arrows are laid out in order.
  let prevHead: Head | undefined;

  if (entry) {
    // Nests into the straight arrow's notch; flat tail on the far left.
    const tipX = STRAIGHT_START_X + HEAD_LEN - SEGMENT_GAP;
    const startX = tipX - ENTRY_LENGTH;
    shapes.push(polygonNode(entry, straightArrowPoints(startX, tipX), LIGHT_SLOT));
    labels.push(...entryLabels(entry, startX + ENTRY_PADDING_X, ENTRY_LENGTH - HEAD_LEN - ENTRY_PADDING_X * 2));
    prevHead = straightHead(tipX);
  }

  if (straight) {
    // Its tip nests into the first curved arrow's notch at the ring's top.
    const tipX = CENTER_X + R_MID * Math.sin(head - gap);
    const slot = slotFor(0);
    const notch = prevHead && notchFor(prevHead, SEGMENT_GAP, false);
    shapes.push(polygonNode(straight, straightArrowPoints(STRAIGHT_START_X, tipX, notch), slot));
    const left = STRAIGHT_START_X + HEAD_LEN;
    const right = tipX - HEAD_LEN;
    labels.push(...stepLabels(straight, (left + right) / 2, MID_Y, right - left, slot));
    prevHead = straightHead(tipX);
  }

  if (arcs.length > 0) {
    // In a closed ring every tip nests into the next arrow's notch, the
    // last one (possibly the only one) into the first's; with an entry, the
    // last arrow simply ends at ARC_END_WITH_ENTRY, below the straight arrow.
    const endOf = (i: number) => {
      const start = ARC_START + i * step;
      return withEntry && i === arcs.length - 1 ? start + step : start + step + head - gap;
    };
    if (!withEntry) prevHead = arcHead(endOf(arcs.length - 1) - 2 * Math.PI, head);
    arcs.forEach((node, i) => {
      const start = ARC_START + i * step;
      const end = endOf(i);
      const loopIndex = withEntry ? i + 1 : i;
      const slot = slotFor(loopIndex);
      const notch = notchFor(prevHead!, gap * R_MID, true);
      shapes.push(polygonNode(node, arcArrowPoints(start, end, head, notch), slot));
      const mid = polar((start + head + end - head) / 2, R_MID);
      labels.push(...stepLabels(node, mid.x, mid.y, Math.min(LABEL_WIDTH, BAND + 10), slot));
      prevHead = arcHead(end, head);
    });
  }

  const trimmedTitle = title.trim();
  if (trimmedTitle && outline.length > 0) {
    labels.push(fixedText(trimmedTitle, {
      x: CENTER_X - TITLE_WIDTH / 2,
      y: CENTER_Y - TITLE_HEIGHT / 2,
      width: TITLE_WIDTH,
      height: TITLE_HEIGHT,
      kind: "label",
      align: "center",
      fontSize: TITLE_FONT_SIZE,
      fontWeight: "bold",
    }));
  }

  // Arrows first, so every label renders on top of them (see
  // regenerateBlockShapes in sync.ts).
  return [...shapes, ...labels];
}

// The ring is centered on (CENTER_X, CENTER_Y), hence normalizeOrigin.
export const cyclePattern: PatternDefinition = {
  label: "サイクル図（円のみ）",
  layout: (outline, params) => layoutCycle(outline, stringParam(params, "title"), false),
  normalizeOrigin: true,
  paramEditors: [TITLE_EDITOR],
};

export const cycleWithEntryPattern: PatternDefinition = {
  label: "サイクル図（導入部あり）",
  layout: (outline, params) => layoutCycle(outline, stringParam(params, "title"), true),
  normalizeOrigin: true,
  paramEditors: [TITLE_EDITOR],
  nodeRule: ({ depth, index }) => (depth === 0 && index === 0 ? { placeholder: "導入部(ループに入る前の段階)" } : {}),
};
