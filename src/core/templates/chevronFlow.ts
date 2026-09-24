import type { OutlineNode } from "../model/document";
import type { Point } from "../model/shape";
import { fixedText, shapeNode, textNode } from "./layoutNode";
import type { LayoutNode } from "./layoutNode";
import { LOCKED_LEAF, emptyNode, emptyNodes } from "./patternDefinition";
import type { PatternDefinition } from "./patternDefinition";

const COLUMN_WIDTH = 260;
const COLUMN_GAP = 28;
// How far a chevron's tip reaches past its own column's right edge, into the
// gap before the next column - the reference image's arrows visibly overhang
// the body box below them.
const CHEVRON_OVERHANG = 20;
const CHEVRON_WIDTH = COLUMN_WIDTH + CHEVRON_OVERHANG;
// Horizontal depth of the chevron's pointed right end.
const CHEVRON_TIP = 26;
const CHEVRON_Y = 36;
const CHEVRON_HEIGHT = 64;

// "Step" + big number sit above the chevron's top-left corner, on the same
// baseline; the chevron's top edge only starts to their right
// (STEP_BLOCK_WIDTH), matching the reference image.
const STEP_WORD_WIDTH = 36;
const STEP_WORD_Y = 18;
const STEP_WORD_HEIGHT = 22;
const STEP_WORD_FONT_SIZE = 15;
const STEP_NUMBER_X = 38;
const STEP_NUMBER_WIDTH = 46;
const STEP_NUMBER_HEIGHT = 44;
const STEP_NUMBER_FONT_SIZE = 36;
const STEP_BLOCK_WIDTH = 84;

const TITLE_PADDING_X = 10;
const TITLE_FONT_SIZE = 18;

const BODY_GAP = 14;
const BODY_Y = CHEVRON_Y + CHEVRON_HEIGHT + BODY_GAP;
const BODY_MIN_HEIGHT = 320;
const BODY_PADDING_X = 12;
const BODY_PADDING_TOP = 16;
const BODY_PADDING_BOTTOM = 8;
const BULLET_LINE_HEIGHT = 24;
const BULLET_FONT_SIZE = 15;
const BULLET_GAP = 12;
const BULLET_MARKER = "> ";
// Continuation lines (a bullet's children) start under the bullet's text
// rather than under its "> " marker, so a wrapped-by-hand bullet reads as one
// item.
const CONTINUATION_INDENT = 16;
const DURATION_GAP = 16;
const DURATION_HEIGHT = 32;
const DURATION_FONT_SIZE = 17;

// Both outlines are drawn as "polygon" shapes that retrace their own path
// instead of closing it, so the shape's stroke leaves one side open (a
// polygon always closes back to its first point - see shape.ts's
// PolygonShape) and its enclosed area is zero:
// - the chevron has no left edge, and its top edge starts right of the
//   "Step N" label, while the bottom edge runs the full width;
// - the body box has no top edge.
// Fractions of the shape's own bounding box, like every other PolygonShape.
function chevronPoints(): Point[] {
  const start = STEP_BLOCK_WIDTH / CHEVRON_WIDTH;
  const shoulder = (CHEVRON_WIDTH - CHEVRON_TIP) / CHEVRON_WIDTH;
  return [
    { x: start, y: 0 },
    { x: shoulder, y: 0 },
    { x: 1, y: 0.5 },
    { x: shoulder, y: 1 },
    { x: 0, y: 1 },
    { x: shoulder, y: 1 },
    { x: 1, y: 0.5 },
    { x: shoulder, y: 0 },
  ];
}

const BODY_POINTS: Point[] = [
  { x: 0, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

function bulletContentHeight(bullets: OutlineNode[]): number {
  if (bullets.length === 0) return 0;
  const lines = bullets.reduce((sum, bullet) => sum + 1 + bullet.children.length, 0);
  return lines * BULLET_LINE_HEIGHT + (bullets.length - 1) * BULLET_GAP;
}

// "フローチャート" (doc/spec.md §6.2.14): a left-to-right row of steps, each
// headed by an auto-numbered "Step N" above an outlined chevron holding the
// step's title, with a box below listing the step's details as "> " bullets
// and its duration ("1週間" etc.) at the bottom. Root outline nodes (depth 0)
// are steps in order; a root's own text is the chevron's title. child[0]
// (position-based, like timeline's time label) is the duration - left empty
// when a step has none; child[1..] are bullets, and a bullet's own children
// are its continuation lines (no wrapping - same "one line per node"
// constraint as every other pattern, doc/spec.md §6.1).
export function layoutChevronFlow(outline: OutlineNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];

  // Every body box shares the tallest step's height, so the durations line
  // up along one bottom row (same reasoning as flowScheduleHorizontal's
  // common card height).
  const bodyHeight = Math.max(
    BODY_MIN_HEIGHT,
    ...outline.map(
      (step) =>
        BODY_PADDING_TOP + bulletContentHeight(step.children.slice(1)) + DURATION_GAP + DURATION_HEIGHT + BODY_PADDING_BOTTOM,
    ),
  );

  outline.forEach((step, i) => {
    const x = i * (COLUMN_WIDTH + COLUMN_GAP);
    const [duration, ...bullets] = step.children;

    // Outlines first, so they render underneath the labels drawn on top of
    // them (see regenerateBlockShapes in sync.ts).
    result.push(shapeNode(step, {
      x,
      y: CHEVRON_Y,
      width: CHEVRON_WIDTH,
      height: CHEVRON_HEIGHT,
      kind: "polygon",
      points: chevronPoints(),
      strokeColorSlot: 1,
    }));
    result.push(shapeNode(step, {
      x,
      y: BODY_Y,
      width: COLUMN_WIDTH,
      height: bodyHeight,
      kind: "polygon",
      points: BODY_POINTS,
      strokeColorSlot: 3,
    }));

    // "Step" + number are purely position-derived (like
    // flowScheduleHorizontal's "01"), not tied to any outline node -
    // untracked, always regenerated with the rest of the block on reorder
    // (isFullyRelayoutedPattern/relayoutOrRegenerate in sync.ts).
    result.push(fixedText("Step", {
      x,
      y: STEP_WORD_Y,
      width: STEP_WORD_WIDTH,
      height: STEP_WORD_HEIGHT,
      kind: "label",
      align: "left",
      fontSize: STEP_WORD_FONT_SIZE,
      textColorSlot: 1,
    }));
    result.push(fixedText(String(i + 1), {
      x: x + STEP_NUMBER_X,
      y: 0,
      width: STEP_NUMBER_WIDTH,
      height: STEP_NUMBER_HEIGHT,
      kind: "label",
      align: "left",
      fontSize: STEP_NUMBER_FONT_SIZE,
      textColorSlot: 1,
    }));

    result.push(textNode(step, 0, {
      x: x + TITLE_PADDING_X,
      y: CHEVRON_Y,
      width: CHEVRON_WIDTH - CHEVRON_TIP - TITLE_PADDING_X * 2,
      height: CHEVRON_HEIGHT,
      kind: "label",
      align: "left",
      fontSize: TITLE_FONT_SIZE,
    }));

    let cy = BODY_Y + BODY_PADDING_TOP;
    bullets.forEach((bullet, j) => {
      if (j > 0) cy += BULLET_GAP;
      result.push(textNode(bullet, 1, {
        x: x + BODY_PADDING_X,
        y: cy,
        width: COLUMN_WIDTH - BODY_PADDING_X * 2,
        height: BULLET_LINE_HEIGHT,
        kind: "label",
        align: "left",
        fontSize: BULLET_FONT_SIZE,
        bulletMarker: BULLET_MARKER,
      }));
      cy += BULLET_LINE_HEIGHT;
      bullet.children.forEach((line) => {
        result.push(textNode(line, 2, {
          x: x + BODY_PADDING_X + CONTINUATION_INDENT,
          y: cy,
          width: COLUMN_WIDTH - BODY_PADDING_X * 2 - CONTINUATION_INDENT,
          height: BULLET_LINE_HEIGHT,
          kind: "label",
          align: "left",
          fontSize: BULLET_FONT_SIZE,
        }));
        cy += BULLET_LINE_HEIGHT;
      });
    });

    // Always generated, even while empty, so typing into a blank duration
    // updates an existing shape through the normal text-only sync path
    // instead of needing a regenerate to make it appear.
    if (duration) {
      result.push(textNode(duration, 1, {
        x,
        y: BODY_Y + bodyHeight - BODY_PADDING_BOTTOM - DURATION_HEIGHT,
        width: COLUMN_WIDTH,
        height: DURATION_HEIGHT,
        kind: "label",
        align: "center",
        fontSize: DURATION_FONT_SIZE,
      }));
    }
  });

  return result;
}

export const chevronFlowPattern: PatternDefinition = {
  label: "フローチャート",
  layout: (outline) => layoutChevronFlow(outline),
  // "Step N" labels are untracked and index-derived, and an indented step
  // would be stranded (see timeline).
  restructure: "regenerate",
  // A step starts with its duration child (child[0]); bullets (child[1..])
  // have no fixed count.
  newRoot: () => emptyNode(emptyNodes(1)),
  // The duration (child[0]) is locked; bullets stay free.
  nodeRule: ({ depth, index }) =>
    depth === 1 && index === 0 ? { ...LOCKED_LEAF, placeholder: "所要期間(例: 1週間、空欄可)" } : {},
};
