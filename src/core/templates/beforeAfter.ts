import type { OutlineNode } from "../model/document";
import type { Point } from "../model/shape";
import { decoration, fixedText, shapeNode, textNode } from "./layoutNode";
import type { LayoutNode } from "./layoutNode";

const SIDEBAR_WIDTH = 140;
const COLUMN_WIDTH = 340;
const COLUMN_GAP = 24;
const CELL_PADDING_X = 20;
const CELL_PADDING_Y = 24;
const CORNER_RADIUS = 12;

const BADGE_WIDTH = 130;
const BADGE_HEIGHT = 28;
const BADGE_FONT_SIZE = 13;
const BADGE_TO_HEADLINE_GAP = 16;
const HEADLINE_FONT_SIZE = 17;
const HEADLINE_HEIGHT = 24;
const HEADLINE_TO_DESC_GAP = 14;
const DESC_LINE_HEIGHT = 22;
const DESC_FONT_SIZE = 13;
const ASIS_MIN_HEIGHT = 200;

const ARROW_GAP = 60;
const ARROW_SIZE = 26;

const TOBE_LINE_HEIGHT = 28;
const TOBE_FONT_SIZE = 17;
// Placeholder vertical space in place of the reference image's per-topic
// illustration (a dashboard/report mockup) - same reasoning as
// flowScheduleHorizontal.ts's ICON_GAP: this app's shape model has no icon/
// image primitive, so a topic's illustration can't be generated from its
// outline text the way every other element here can.
const TOBE_ICON_GAP = 90;
const TOBE_MIN_HEIGHT = 220;

const SIDEBAR_LABEL_FONT_SIZE = 20;

const ASIS_LABEL = "AS-IS";
const TOBE_LABEL = "TO-BE";

// Downward arrow, as vertex fractions of its own bounding box (see
// shape.ts's PolygonShape) - same idea as schedule.ts's downward milestone
// triangle.
const DOWN_TRIANGLE_POINTS: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0.5, y: 1 },
];

// "ビフォーアフター（縦）" (doc/spec.md §6.2.12): a row of before/after
// comparison columns (e.g. a pain point and how a product resolves it) -
// a shared "AS-IS"/"TO-BE" row-header sidebar on the left, and one column per
// topic, each an ASIS cell (a small badge, a bold headline, and a plain
// description) above a down arrow above a TOBE cell (a bold, theme-colored
// callout, possibly several lines). Root outline nodes (depth 0) are topics
// in order, and A ROOT'S OWN TEXT IS THE BADGE (e.g. "現場の悩み") - unlike
// every other position-based pattern here (pyramidChart, bulletMatrix), a
// root's text is never left unused: every input row needs a visible
// destination, and the badge is the first thing a reader sees in the column
// anyway. child[0] (position-based, like pyramidChart's scale/cells) is the
// ASIS block - its own text is the headline, its children are the
// description lines (free list, no wrap - split across multiple nodes like
// every other pattern). child[1] is the TOBE block - its own text is the
// callout's first line, its children are additional lines (uniformly
// styled, like horizontalFlow's stacked label lines - doc/spec.md §6.2.8),
// since the reference image's TOBE callouts read as one multi-line block
// with no separate "headline vs. body" distinction.
export function layoutBeforeAfter(outline: OutlineNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  if (outline.length === 0) return result;

  // Every column shares one height per section (ASIS/TOBE), so the sidebar
  // and every cell in a row line up into a clean grid - same "uniform strip"
  // reasoning as flowScheduleHorizontal's cardHeight.
  const asisHeight = Math.max(
    ASIS_MIN_HEIGHT,
    ...outline.map((topic) => {
      const asis = topic.children[0];
      const descCount = asis?.children.length ?? 0;
      return (
        CELL_PADDING_Y * 2 +
        BADGE_HEIGHT +
        BADGE_TO_HEADLINE_GAP +
        HEADLINE_HEIGHT +
        (descCount > 0 ? HEADLINE_TO_DESC_GAP + descCount * DESC_LINE_HEIGHT : 0)
      );
    }),
  );
  const tobeHeight = Math.max(
    TOBE_MIN_HEIGHT,
    ...outline.map((topic) => {
      const tobe = topic.children[1];
      const lineCount = tobe ? 1 + tobe.children.length : 0;
      return CELL_PADDING_Y * 2 + lineCount * TOBE_LINE_HEIGHT + TOBE_ICON_GAP;
    }),
  );

  const asisTop = 0;
  const gapTop = asisTop + asisHeight;
  const tobeTop = gapTop + ARROW_GAP;

  // The sidebar backgrounds first, so they render underneath their own
  // labels drawn on top (see regenerateBlockShapes in sync.ts) - same
  // ordering reason as matrix.ts's background square. Untracked (`nodeIds:
  // []`): "ASIS"/"TOBE" are fixed structural furniture, not derived from any
  // outline node, same reasoning as flowSchedule's title.
  result.push(decoration({ x: 0, y: asisTop, width: SIDEBAR_WIDTH, height: asisHeight, kind: "rect", fillColorSlot: 0 }));
  result.push(fixedText(ASIS_LABEL, {
    x: 0,
    y: asisTop,
    width: SIDEBAR_WIDTH,
    height: asisHeight,
    kind: "label",
    align: "center",
    fontWeight: "bold",
    fontSize: SIDEBAR_LABEL_FONT_SIZE,
    contrastBgColorSlot: 0,
  }));

  result.push(decoration({ x: 0, y: tobeTop, width: SIDEBAR_WIDTH, height: tobeHeight, kind: "rect", fillColorSlot: 1 }));
  result.push(fixedText(TOBE_LABEL, {
    x: 0,
    y: tobeTop,
    width: SIDEBAR_WIDTH,
    height: tobeHeight,
    kind: "label",
    align: "center",
    fontWeight: "bold",
    fontSize: SIDEBAR_LABEL_FONT_SIZE,
    contrastBgColorSlot: 1,
  }));

  outline.forEach((topic, i) => {
    const x = SIDEBAR_WIDTH + COLUMN_GAP + i * (COLUMN_WIDTH + COLUMN_GAP);
    const asis = topic.children[0];
    const tobe = topic.children[1];

    // ASIS cell background - fixed neutral gray (`neutralFill`, see
    // layoutNode.ts/style.ts), not this document's color theme: it reads as
    // the "problem" state, which shouldn't carry the brand color the TOBE
    // cell (the theme-colored future state) gets below.
    result.push(shapeNode(asis, {
      x,
      y: asisTop,
      width: COLUMN_WIDTH,
      height: asisHeight,
      kind: "rect",
      neutralFill: true,
      cornerRadius: CORNER_RADIUS,
    }));

    // The badge is the TOPIC's own text (see the doc comment above), not a
    // fixed decoration or a child of the ASIS block.
    let cy = asisTop + CELL_PADDING_Y;
    result.push(textNode(topic, 0, {
      x: x + (COLUMN_WIDTH - BADGE_WIDTH) / 2,
      y: cy,
      width: BADGE_WIDTH,
      height: BADGE_HEIGHT,
      kind: "heading",
      fontSize: BADGE_FONT_SIZE,
    }));
    cy += BADGE_HEIGHT + BADGE_TO_HEADLINE_GAP;

    result.push(textNode(asis, 1, {
      x: x + CELL_PADDING_X,
      y: cy,
      width: COLUMN_WIDTH - CELL_PADDING_X * 2,
      height: HEADLINE_HEIGHT,
      kind: "label",
      align: "center",
      fontWeight: "bold",
      fontSize: HEADLINE_FONT_SIZE,
    }));
    cy += HEADLINE_HEIGHT;

    const descLines = asis?.children ?? [];
    if (descLines.length > 0) {
      cy += HEADLINE_TO_DESC_GAP;
      descLines.forEach((desc, j) => {
        result.push(textNode(desc, 2, {
          x: x + CELL_PADDING_X,
          y: cy + j * DESC_LINE_HEIGHT,
          width: COLUMN_WIDTH - CELL_PADDING_X * 2,
          height: DESC_LINE_HEIGHT,
          kind: "label",
          align: "left",
          fontSize: DESC_FONT_SIZE,
          textColorSlot: 2,
        }));
      });
    }

    result.push(decoration({
      x: x + COLUMN_WIDTH / 2 - ARROW_SIZE / 2,
      y: gapTop + (ARROW_GAP - ARROW_SIZE) / 2,
      width: ARROW_SIZE,
      height: ARROW_SIZE,
      kind: "polygon",
      points: DOWN_TRIANGLE_POINTS,
      fillColorSlot: 0,
    }));

    // TOBE cell background - the theme's own palest shade (unlike ASIS's
    // fixed neutral gray above), so it reads as this document's brand color.
    result.push(shapeNode(tobe, {
      x,
      y: tobeTop,
      width: COLUMN_WIDTH,
      height: tobeHeight,
      kind: "rect",
      fillColorSlot: 4,
      cornerRadius: CORNER_RADIUS,
    }));

    const tobeLines = tobe ? [tobe, ...tobe.children] : [];
    const ty = tobeTop + CELL_PADDING_Y;
    tobeLines.forEach((line, j) => {
      result.push(textNode(line, j === 0 ? 1 : 2, {
        x: x + CELL_PADDING_X,
        y: ty + j * TOBE_LINE_HEIGHT,
        width: COLUMN_WIDTH - CELL_PADDING_X * 2,
        height: TOBE_LINE_HEIGHT,
        kind: "label",
        align: "center",
        fontWeight: "bold",
        fontSize: TOBE_FONT_SIZE,
        textColorSlot: 1,
      }));
    });
  });

  return result;
}
