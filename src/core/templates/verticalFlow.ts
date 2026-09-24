import type { OutlineNode } from "../model/document";
import type { ThemeColorSlot } from "../model/style";
import { decoration, textNode } from "./layoutNode";
import type { LayoutNode } from "./layoutNode";
import { lineStack } from "./parts/lineStack";
import { emptyNode, emptyNodes } from "./patternDefinition";
import type { PatternDefinition } from "./patternDefinition";

const BADGE_WIDTH = 96;
const BADGE_HEIGHT = 32;
const BADGE_FONT_SIZE = 13;
const CONTENT_GAP = 24; // horizontal gap between the badge column and the title/description column
const CONTENT_X = BADGE_WIDTH + CONTENT_GAP;
const CONTENT_WIDTH = 480;
const TITLE_HEIGHT = 28;
const TITLE_FONT_SIZE = 18;
const DESC_GAP_TOP = 6;
const DESC_LINE_HEIGHT = 22;
const DESC_FONT_SIZE = 13;
// Also the connector arrow's own minimum length (see the gap computation
// below) - space between one step's content and the next.
const STEP_GAP = 40;
const HEADER_HEIGHT = Math.max(BADGE_HEIGHT, TITLE_HEIGHT);

// Cycles a step's badge through the theme's shade scale from lightest (first
// step) to darkest, reserving `accent` for the final step - the reference
// image this pattern is built from ("JOIN !!") uses a visually distinct color
// for the last step since it's a different kind of milestone (an outcome, not
// another step in the sequence) rather than just continuing the ramp.
function badgeColorSlot(index: number, total: number): ThemeColorSlot {
  if (total > 1 && index === total - 1) return "accent";
  return Math.max(0, 4 - index) as ThemeColorSlot;
}

// "フロー図（縦型）": a vertical sequence of steps (e.g. a hiring/onboarding
// flow), each a colored badge (e.g. "STEP 1") beside a title and optional
// description lines, connected top-to-bottom by a dashed arrow. Root outline
// nodes (depth 0) are steps in order; a root's own text is the step's title.
// Children are position-based like pyramidChart's scale/cells (doc/spec.md
// §6.2.5): child[0] is the badge label, child[1..] are description lines
// stacked below the title. The badge label is free text rather than
// auto-numbered from the step's index, since a flow's final step commonly
// breaks the "STEP n" naming (e.g. "JOIN !!"); description lines stay
// separate lines rather than one wrapped block, matching every other
// pattern's no-wrap constraint.
export function layoutVerticalFlow(outline: OutlineNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  const badgeTops: number[] = [];
  let y = 0;

  outline.forEach((step, index) => {
    const badgeNode = step.children[0];
    const descNodes = step.children.slice(1);
    const colorSlot = badgeColorSlot(index, outline.length);
    const badgeY = y + (HEADER_HEIGHT - BADGE_HEIGHT) / 2;
    badgeTops.push(badgeY);

    result.push(textNode(badgeNode, 1, {
      x: 0,
      y: badgeY,
      width: BADGE_WIDTH,
      height: BADGE_HEIGHT,
      kind: "heading",
      fontSize: BADGE_FONT_SIZE,
      fillColorSlot: colorSlot,
      // Same slot as the fill, so the label stays legible against both the
      // pale early shades and the dark late ones (style.ts's contrastTextColor).
      contrastBgColorSlot: colorSlot,
    }));

    result.push(textNode(step, 0, {
      x: CONTENT_X,
      y: y + (HEADER_HEIGHT - TITLE_HEIGHT) / 2,
      width: CONTENT_WIDTH,
      height: TITLE_HEIGHT,
      kind: "label",
      align: "left",
      fontSize: TITLE_FONT_SIZE,
      fontWeight: "bold",
    }));

    result.push(
      ...lineStack(descNodes, {
        x: CONTENT_X,
        y: y + HEADER_HEIGHT + DESC_GAP_TOP,
        width: CONTENT_WIDTH,
        lineHeight: DESC_LINE_HEIGHT,
        depth: 2,
        props: { kind: "label", align: "left", fontSize: DESC_FONT_SIZE, textColorSlot: 2 },
      }),
    );

    const contentHeight = HEADER_HEIGHT + (descNodes.length > 0 ? DESC_GAP_TOP + descNodes.length * DESC_LINE_HEIGHT : 0);
    y += contentHeight + STEP_GAP;
  });

  // One dashed arrow per consecutive badge pair, from one's bottom edge to
  // the next's top edge - untracked (`nodeIds: []`, same convention as
  // schedule's dependency arrows), since it isn't tied to any single outline
  // node. All badges share the same x (0) and width, so the connector's x is
  // just their shared center.
  for (let i = 0; i < badgeTops.length - 1; i++) {
    result.push(decoration({
      x: BADGE_WIDTH / 2,
      y: badgeTops[i] + BADGE_HEIGHT,
      width: 0,
      height: badgeTops[i + 1] - (badgeTops[i] + BADGE_HEIGHT),
      kind: "line",
      arrowhead: true,
    }));
  }

  return result;
}

export const verticalFlowPattern: PatternDefinition = {
  layout: (outline) => layoutVerticalFlow(outline),
  // The badge-to-badge arrows are untracked shapes whose positions follow
  // the steps.
  restructure: "regenerate",
  // A step starts with its badge child (child[0]); description lines
  // (child[1..]) have no fixed count, so only the badge is prefilled.
  newRoot: () => emptyNode(emptyNodes(1)),
};
