import type { OutlineNode } from "../model/document";
import { decoration, fixedText, shapeNode, textNode } from "./layoutNode";
import type { LayoutNode } from "./layoutNode";

const CARD_WIDTH = 220;
const CARD_MIN_HEIGHT = 300;
const CARD_PADDING_Y = 24;
const CORNER_RADIUS = 16;
// Gap between two cards, wide enough to hold the connector triangle below
// (TRIANGLE_SIZE) centered within it.
const CONNECTOR_WIDTH = 64;
const TRIANGLE_SIZE = 22;

const NUMBER_HEIGHT = 48;
const NUMBER_FONT_SIZE = 30;
const GAP_NUMBER_LABEL = 8;
const LABEL_HEIGHT = 26;
const LABEL_FONT_SIZE = 17;
// Vertical breathing room below the label, in place of the reference image's
// per-step pictogram (envelope, people talking, a document, ...) - this app's
// shape model has no icon/image primitive, only geometric shapes and text
// (doc/spec.md §3.1), so a step's icon can't be generated from its outline
// text the way every other element here can. Kept as spacing rather than
// dropped outright so the card's overall proportions still read close to the
// reference instead of the description crowding up under the label.
const ICON_GAP = 64;
const DESC_PADDING_X = 20;
const DESC_LINE_HEIGHT = 22;
const DESC_FONT_SIZE = 13;

const TITLE_HEIGHT = 30;
const TITLE_GAP = 32;
const TITLE_BAND_WIDTH = 340;
const TITLE_FONT_SIZE = 22;
const TITLE_LINE_GAP = 16;

function stepNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

// Right-pointing triangle, as vertex fractions of its own bounding box (see
// shape.ts's PolygonShape) - same idea as schedule.ts's downward milestone
// triangle, just rotated 90°.
const RIGHT_TRIANGLE_POINTS = [
  { x: 0, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 0.5 },
];

// "フロースケジュール（横）" (doc/spec.md §6.2.10): flowSchedule (§6.2.9)
// turned sideways - a left-to-right row of rounded-corner step cards, each
// showing a big auto-numbered "01" above a bold label above a plain
// description, with a filled triangle connector in the gap between adjacent
// cards, under the same optional flanking-dashed-rule title as the vertical
// pattern. Root outline nodes (depth 0) are steps in order; a root's own text
// is the step's label, and its children are description lines stacked below
// it (no bullet marker, no wrapping - same "one line per child node"
// constraint as every other pattern, doc/spec.md §6.1).
export function layoutFlowScheduleHorizontal(outline: OutlineNode[], title: string): LayoutNode[] {
  const result: LayoutNode[] = [];
  const totalWidth = outline.length > 0 ? outline.length * CARD_WIDTH + (outline.length - 1) * CONNECTOR_WIDTH : 0;

  // Every card shares the tallest step's height, so the row reads as one
  // aligned strip rather than a ragged skyline (unlike flowSchedule's
  // vertical rows, where each row only needs to fit its own content since
  // rows don't sit side by side).
  const cardHeight = Math.max(
    CARD_MIN_HEIGHT,
    ...outline.map((step) => CARD_PADDING_Y * 2 + NUMBER_HEIGHT + GAP_NUMBER_LABEL + LABEL_HEIGHT + ICON_GAP + step.children.length * DESC_LINE_HEIGHT),
  );

  let y = 0;
  const trimmedTitle = title.trim();
  if (trimmedTitle) {
    const bandWidth = Math.min(TITLE_BAND_WIDTH, totalWidth || TITLE_BAND_WIDTH);
    const bandX = (totalWidth - bandWidth) / 2;
    result.push(fixedText(trimmedTitle, {
      x: bandX,
      y: 0,
      width: bandWidth,
      height: TITLE_HEIGHT,
      kind: "label",
      align: "center",
      fontWeight: "bold",
      fontSize: TITLE_FONT_SIZE,
      // No textColorSlot override - see flowSchedule.ts's own title for why
      // (reads the same primary color as everything else, not an accent).
    }));

    const lineY = TITLE_HEIGHT / 2;
    const leftWidth = bandX - TITLE_LINE_GAP;
    if (leftWidth > 0) {
      result.push(decoration({ x: 0, y: lineY, width: leftWidth, height: 0, kind: "line" }));
      result.push(decoration({
        x: bandX + bandWidth + TITLE_LINE_GAP,
        y: lineY,
        width: totalWidth - (bandX + bandWidth + TITLE_LINE_GAP),
        height: 0,
        kind: "line",
      }));
    }

    y = TITLE_HEIGHT + TITLE_GAP;
  }

  outline.forEach((step, i) => {
    const x = i * (CARD_WIDTH + CONNECTOR_WIDTH);

    // The card's own outline first, so it renders underneath the number/
    // label/description labels drawn on top of it (see regenerateBlockShapes
    // in sync.ts) - same ordering reason as matrix.ts's background square.
    // Unfilled (no fillColorSlot) and undashed (kind "rect"'s own default is
    // a solid border - see layoutNode.ts's `dashed` doc) - just a rounded
    // outline, matching the reference image's cards.
    result.push(shapeNode(step, {
      x,
      y,
      width: CARD_WIDTH,
      height: cardHeight,
      kind: "rect",
      cornerRadius: CORNER_RADIUS,
    }));

    let cy = y + CARD_PADDING_Y;
    // The number is purely position-derived (like schedule.ts's row number),
    // not tied to any outline node - untracked, always regenerated with the
    // rest of the block on reorder (isFullyRelayoutedPattern/
    // relayoutOrRegenerate in sync.ts).
    result.push(fixedText(stepNumber(i), {
      x,
      y: cy,
      width: CARD_WIDTH,
      height: NUMBER_HEIGHT,
      kind: "label",
      align: "center",
      fontWeight: "bold",
      fontSize: NUMBER_FONT_SIZE,
    }));
    cy += NUMBER_HEIGHT + GAP_NUMBER_LABEL;

    result.push(textNode(step, 0, {
      x,
      y: cy,
      width: CARD_WIDTH,
      height: LABEL_HEIGHT,
      kind: "label",
      align: "center",
      fontWeight: "bold",
      fontSize: LABEL_FONT_SIZE,
    }));
    cy += LABEL_HEIGHT + ICON_GAP;

    step.children.forEach((desc, j) => {
      result.push(textNode(desc, 1, {
        x: x + DESC_PADDING_X,
        y: cy + j * DESC_LINE_HEIGHT,
        width: CARD_WIDTH - DESC_PADDING_X * 2,
        height: DESC_LINE_HEIGHT,
        kind: "label",
        align: "left",
        fontSize: DESC_FONT_SIZE,
      }));
    });

    if (i < outline.length - 1) {
      const gapX = x + CARD_WIDTH;
      result.push(decoration({
        x: gapX + (CONNECTOR_WIDTH - TRIANGLE_SIZE) / 2,
        y: y + cardHeight / 2 - TRIANGLE_SIZE / 2,
        width: TRIANGLE_SIZE,
        height: TRIANGLE_SIZE,
        kind: "polygon",
        points: RIGHT_TRIANGLE_POINTS,
        fillColorSlot: 0,
      }));
    }
  });

  return result;
}
