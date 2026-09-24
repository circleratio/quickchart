import type { OutlineNode } from "../model/document";
import type { Point } from "../model/shape";
import type { ThemeColorSlot } from "../model/style";
import { decoration, fixedText, shapeNode, textNode } from "./layoutNode";
import type { LayoutNode } from "./layoutNode";
import { polygonFromAbsolute } from "./parts/polygon";
import { emptyNodes } from "./patternDefinition";
import type { PatternDefinition } from "./patternDefinition";

export const MATRIX_MAX_ROOTS = 4;

const QUADRANT_WIDTH = 380;
const QUADRANT_MIN_HEIGHT = 300;
// The gap between quadrants, which the axis cross runs through.
const QUADRANT_GAP = 32;

const BADGE_INSET = 18;
const BADGE_HEIGHT = 56;
const BADGE_RADIUS = 12;
const BADGE_FONT_SIZE = 20;

const BULLET_INSET_X = 24;
// Space above the first bullet when a quadrant's badge sits at its bottom
// (the bottom row) instead of above the bullets.
const BULLET_TOP_PADDING = 24;
const BULLET_LINE_HEIGHT = 26;
const BULLET_GAP = 8;
const BULLET_FONT_SIZE = 16;
const BULLET_MARKER = "□ ";
// Continuation lines start under the bullet's text, not its "□ " marker.
const CONTINUATION_INDENT = 22;

// The axis cross: two double-headed arrows through the quadrants' shared
// corner, reaching AXIS_OVERHANG past the grid on every side.
const AXIS_BAR = 12;
const AXIS_HEAD_LENGTH = 26;
const AXIS_HEAD_WIDTH = 30;
const AXIS_OVERHANG = 40;

const AXIS_LABEL_GAP = 8;
const AXIS_LABEL_FONT_SIZE = 26;
const AXIS_END_LABEL_WIDTH = 240;
const AXIS_END_LABEL_HEIGHT = 40;
const AXIS_SIDE_LABEL_WIDTH = 120;

const TITLE_WIDTH = 480;
const TITLE_HEIGHT = 36;
const TITLE_FONT_SIZE = 20;
const TITLE_GAP = 16;

// Each quadrant's heading badge gets its own look, in the reference image's
// order (natural reading order, see QUADRANT_OFFSETS below): an accent-filled
// badge, a dark one, a pale one, and an unfilled outlined one.
const BADGE_FILLS: Array<ThemeColorSlot | undefined> = ["accent", 0, 3, undefined];

export interface MatrixParams {
  title?: string;
  axisTop?: string;
  axisBottom?: string;
  axisLeft?: string;
  axisRight?: string;
}

// Reads the matrix's params, falling back to the pre-redesign axis names for
// older project files: an axis's name reads as its positive end, so the old
// horizontal axis name becomes the right end and the vertical one the top.
export function matrixParams(params: Record<string, unknown>): Required<MatrixParams> {
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    title: str(params.title) ?? "",
    axisTop: str(params.axisTop) ?? str(params.axisYLabel) ?? "",
    axisBottom: str(params.axisBottom) ?? "",
    axisLeft: str(params.axisLeft) ?? "",
    axisRight: str(params.axisRight) ?? str(params.axisXLabel) ?? "",
  };
}

function bulletsHeight(bullets: OutlineNode[]): number {
  if (bullets.length === 0) return 0;
  const lines = bullets.reduce((sum, b) => sum + 1 + b.children.length, 0);
  return lines * BULLET_LINE_HEIGHT + (bullets.length - 1) * BULLET_GAP;
}

// A horizontal (or, transposed, vertical) double-headed arrow from `from` to
// `to` along one axis, centered on `across`.
function doubleArrow(from: number, to: number, across: number, vertical: boolean): Point[] {
  const bar = AXIS_BAR / 2;
  const head = AXIS_HEAD_WIDTH / 2;
  const pts: Array<[number, number]> = [
    [from, across],
    [from + AXIS_HEAD_LENGTH, across - head],
    [from + AXIS_HEAD_LENGTH, across - bar],
    [to - AXIS_HEAD_LENGTH, across - bar],
    [to - AXIS_HEAD_LENGTH, across - head],
    [to, across],
    [to - AXIS_HEAD_LENGTH, across + head],
    [to - AXIS_HEAD_LENGTH, across + bar],
    [from + AXIS_HEAD_LENGTH, across + bar],
    [from + AXIS_HEAD_LENGTH, across + head],
  ];
  return pts.map(([a, b]) => (vertical ? { x: b, y: a } : { x: a, y: b }));
}

function polygonNode(abs: Point[]): LayoutNode {
  return decoration({ ...polygonFromAbsolute(abs), fillColorSlot: 0 });
}

// "４象限マトリクス" (doc/spec.md §6.2.1): four outlined quadrants split by a cross
// of double-headed axis arrows, with a label at each arrow end (params
// axisTop/axisBottom/axisLeft/axisRight) and an optional underlined title
// (params.title). Root outline nodes are the quadrants in natural reading
// order (top-left, top-right, bottom-left, bottom-right); a quadrant's own
// text is its heading badge - at the top of the quadrant in the top row, at
// the bottom in the bottom row - and its children are "□ " bullets, their
// children continuation lines. A 5th+ root is defensively ignored (the UI
// stops at 4). Laid out around the grid's top-left at (0, 0); sync.ts's
// normalizeToOrigin shifts it so the title/left label land at x/y 0.
export function layoutMatrix(outline: OutlineNode[], params: MatrixParams = {}): LayoutNode[] {
  if (outline.length === 0) return [];
  const { title, axisTop, axisBottom, axisLeft, axisRight } = matrixParams(params as Record<string, unknown>);
  const quadrants = outline.slice(0, MATRIX_MAX_ROOTS);

  // One common height, so both rows (and the cross between them) line up.
  const quadrantHeight = Math.max(
    QUADRANT_MIN_HEIGHT,
    ...quadrants.map((q) => BADGE_INSET + BADGE_HEIGHT + BADGE_INSET + bulletsHeight(q.children) + BULLET_TOP_PADDING),
  );
  const gridWidth = QUADRANT_WIDTH * 2 + QUADRANT_GAP;
  const gridHeight = quadrantHeight * 2 + QUADRANT_GAP;
  const centerX = QUADRANT_WIDTH + QUADRANT_GAP / 2;
  const centerY = quadrantHeight + QUADRANT_GAP / 2;

  const shapes: LayoutNode[] = [];
  const labels: LayoutNode[] = [];

  quadrants.forEach((quadrant, i) => {
    const x = (i % 2) * (QUADRANT_WIDTH + QUADRANT_GAP);
    const y = Math.floor(i / 2) * (quadrantHeight + QUADRANT_GAP);
    const isBottomRow = i >= 2;

    shapes.push(shapeNode(quadrant, {
      x,
      y,
      width: QUADRANT_WIDTH,
      height: quadrantHeight,
      kind: "rect",
      strokeColorSlot: 2,
    }));

    const badgeY = isBottomRow ? y + quadrantHeight - BADGE_INSET - BADGE_HEIGHT : y + BADGE_INSET;
    const fill = BADGE_FILLS[i];
    const badge = shapeNode(quadrant, {
      x: x + BADGE_INSET,
      y: badgeY,
      width: QUADRANT_WIDTH - BADGE_INSET * 2,
      height: BADGE_HEIGHT,
    });
    shapes.push(
      fill !== undefined
        ? { ...badge, kind: "rect", fillColorSlot: fill, cornerRadius: BADGE_RADIUS }
        : { ...badge, kind: "rect", strokeColorSlot: 0, cornerRadius: BADGE_RADIUS },
    );
    labels.push({
      ...badge,
      text: quadrant.text,
      kind: "label",
      align: "center",
      fontSize: BADGE_FONT_SIZE,
      fontWeight: "bold",
      ...(fill !== undefined ? { contrastBgColorSlot: fill } : {}),
    });

    let cy = isBottomRow ? y + BULLET_TOP_PADDING : badgeY + BADGE_HEIGHT + BADGE_INSET;
    quadrant.children.forEach((bullet, j) => {
      if (j > 0) cy += BULLET_GAP;
      labels.push(textNode(bullet, 1, {
        x: x + BULLET_INSET_X,
        y: cy,
        width: QUADRANT_WIDTH - BULLET_INSET_X * 2,
        height: BULLET_LINE_HEIGHT,
        kind: "label",
        align: "left",
        fontSize: BULLET_FONT_SIZE,
        bulletMarker: BULLET_MARKER,
      }));
      cy += BULLET_LINE_HEIGHT;
      bullet.children.forEach((line) => {
        labels.push(textNode(line, 2, {
          x: x + BULLET_INSET_X + CONTINUATION_INDENT,
          y: cy,
          width: QUADRANT_WIDTH - BULLET_INSET_X * 2 - CONTINUATION_INDENT,
          height: BULLET_LINE_HEIGHT,
          kind: "label",
          align: "left",
          fontSize: BULLET_FONT_SIZE,
        }));
        cy += BULLET_LINE_HEIGHT;
      });
    });
  });

  // The cross is drawn after the quadrant boxes so it sits on top of their
  // inner edges, but before every label.
  shapes.push(polygonNode(doubleArrow(-AXIS_OVERHANG, gridWidth + AXIS_OVERHANG, centerY, false)));
  shapes.push(polygonNode(doubleArrow(-AXIS_OVERHANG, gridHeight + AXIS_OVERHANG, centerX, true)));

  // Axis end labels are untracked (params, not outline) and only drawn when
  // set, so an unused end leaves no empty box behind.
  const axisLabel = (text: string, x: number, y: number, width: number, align: "left" | "center" | "right"): LayoutNode =>
    fixedText(text, {
      x,
      y,
      width,
      height: AXIS_END_LABEL_HEIGHT,
      kind: "label",
      align,
      fontSize: AXIS_LABEL_FONT_SIZE,
      fontWeight: "bold",
      textColorSlot: "accent",
    });
  const endLabelX = centerX - AXIS_END_LABEL_WIDTH / 2;
  const topLabelY = -AXIS_OVERHANG - AXIS_LABEL_GAP - AXIS_END_LABEL_HEIGHT;
  const sideLabelY = centerY - AXIS_END_LABEL_HEIGHT / 2;
  const leftLabelX = -AXIS_OVERHANG - AXIS_LABEL_GAP - AXIS_SIDE_LABEL_WIDTH;
  if (axisTop.trim()) labels.push(axisLabel(axisTop.trim(), endLabelX, topLabelY, AXIS_END_LABEL_WIDTH, "center"));
  if (axisBottom.trim()) {
    labels.push(axisLabel(axisBottom.trim(), endLabelX, gridHeight + AXIS_OVERHANG + AXIS_LABEL_GAP, AXIS_END_LABEL_WIDTH, "center"));
  }
  if (axisLeft.trim()) labels.push(axisLabel(axisLeft.trim(), leftLabelX, sideLabelY, AXIS_SIDE_LABEL_WIDTH, "right"));
  if (axisRight.trim()) {
    labels.push(axisLabel(axisRight.trim(), gridWidth + AXIS_OVERHANG + AXIS_LABEL_GAP, sideLabelY, AXIS_SIDE_LABEL_WIDTH, "left"));
  }

  if (title.trim()) {
    // Above everything else, flush with the block's left edge (the left
    // axis label's box, whether or not it's drawn, so the title doesn't jump
    // when that label is cleared).
    labels.push(fixedText(title.trim(), {
      x: leftLabelX,
      y: topLabelY - TITLE_GAP - TITLE_HEIGHT,
      width: TITLE_WIDTH,
      height: TITLE_HEIGHT,
      kind: "label",
      align: "left",
      fontSize: TITLE_FONT_SIZE,
      fontWeight: "bold",
      underline: true,
    }));
  }

  // Boxes/badges/cross first, so every label renders on top of them (see
  // regenerateBlockShapes in sync.ts).
  return [...shapes, ...labels];
}

export const matrixPattern: PatternDefinition = {
  layout: (outline, params) => layoutMatrix(outline, params as MatrixParams),
  // The axis cross/labels/title are laid out around the grid's own top-left.
  normalizeOrigin: true,
  restructure: "relayout",
  // A matrix always has its 4 quadrants, so a fresh block starts with all of
  // them, empty, rather than growing one quadrant at a time.
  initialOutline: () => emptyNodes(MATRIX_MAX_ROOTS),
  // A pre-redesign block's axisXLabel/axisYLabel are carried over into their
  // new fields (matrixParams) and dropped, along with its stale
  // _axisShapeIds (doc/spec.md §6.2.1).
  onParamsChange: (outline, params) => {
    const { axisXLabel: _x, axisYLabel: _y, _axisShapeIds: _ids, ...rest } = params;
    return { outline, params: { ...rest, ...matrixParams(params) } };
  },
};
