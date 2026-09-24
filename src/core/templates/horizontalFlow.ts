import type { OutlineNode } from "../model/document";
import type { ThemeColorSlot } from "../model/style";
import { decoration, shapeNode } from "./layoutNode";
import type { LayoutNode } from "./layoutNode";
import { lineStack } from "./parts/lineStack";
import type { PatternDefinition } from "./patternDefinition";

const CIRCLE_DIAMETER = 168;
// Horizontal gap between circles, doubling as the connector arrow's length.
const STEP_GAP = 56;
const CIRCLE_PADDING_X = 16;
const LABEL_WIDTH = CIRCLE_DIAMETER - CIRCLE_PADDING_X * 2;
const LABEL_LINE_HEIGHT = 26;
const LABEL_FONT_SIZE = 18;

// Darkens each step's circle going left to right, one shade per step (the
// first step is excluded - it's always the unfilled "casual/optional"
// circle, see layoutHorizontalFlow). Unlike verticalFlow's badgeColorSlot,
// there's no separate `accent` reserved for the last step: the reference
// image's horizontal flow just keeps darkening to the end rather than
// calling out a distinct final milestone.
function circleColorSlot(index: number): ThemeColorSlot {
  return Math.max(0, 4 - index) as ThemeColorSlot;
}

// "フロー図（横型）": a left-to-right sequence of circular steps (e.g. a
// hiring flow), connected by solid arrows. Root outline nodes (depth 0) are
// steps in order, and a root's own text is the step's main label - bold,
// centered in its circle, and the only text a step needs. A step's children
// (added via "+子", entirely optional - unlike pyramidChart/verticalFlow's
// position-based children, nothing here depends on a fixed child position)
// are extra label lines stacked below it in the same style, for a step whose
// label reads better split across lines than as one (e.g. "応募"/"書類選考"
// as root+1 child rather than one wrapped block, matching every other
// pattern's no-wrap constraint).
//
// The FIRST step (index 0) always renders as an unfilled, dashed-outline
// circle - the reference image's visual cue for an optional/casual entry
// point - while every other step is a solid-filled circle, darkening left to
// right (circleColorSlot above).
export function layoutHorizontalFlow(outline: OutlineNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  const circleRights: number[] = [];
  const centerY = CIRCLE_DIAMETER / 2;

  outline.forEach((step, index) => {
    const x = index * (CIRCLE_DIAMETER + STEP_GAP);
    const labelX = x + CIRCLE_PADDING_X;
    circleRights.push(x + CIRCLE_DIAMETER);
    const isFirst = index === 0;
    const colorSlot = isFirst ? undefined : circleColorSlot(index);

    // The circle first, so it renders underneath the label shapes drawn on
    // top of it (see regenerateBlockShapes in sync.ts) - same ordering
    // reason as pyramidChart's band/matrix's quadrant background.
    result.push(shapeNode(step, {
      x,
      y: 0,
      width: CIRCLE_DIAMETER,
      height: CIRCLE_DIAMETER,
      kind: "ellipse",
      paint: colorSlot === undefined ? { stroke: 0, dashed: true } : { fill: colorSlot },
    }));

    // The step's own label (root) plus any extra lines (children), stacked
    // and centered as one block - uniform styling throughout, so which line
    // is "the root" is just an editing/sync detail (which OutlineNode a line
    // is tied to), not a visual one.
    const lines = [step, ...step.children];
    const contentHeight = lines.length * LABEL_LINE_HEIGHT;
    const startY = centerY - contentHeight / 2;

    result.push(
      ...lineStack(lines, {
        x: labelX,
        y: startY,
        width: LABEL_WIDTH,
        lineHeight: LABEL_LINE_HEIGHT,
        depth: (i) => (i === 0 ? 0 : 1),
        props: {
          kind: "label",
          align: "center",
          fontSize: LABEL_FONT_SIZE,
          fontWeight: "bold",
          ...(colorSlot !== undefined ? { contrastBgColorSlot: colorSlot } : {}),
        },
      }),
    );
  });

  // One solid arrow per consecutive circle pair, from one's right edge to the
  // next's left edge - untracked (`nodeIds: []`, same convention as
  // schedule's dependency arrows), since it isn't tied to any single outline
  // node. All circles share the same height, so centerY is constant.
  for (let i = 0; i < circleRights.length - 1; i++) {
    const nextX = (i + 1) * (CIRCLE_DIAMETER + STEP_GAP);
    result.push(decoration({
      x: circleRights[i],
      y: centerY,
      width: nextX - circleRights[i],
      height: 0,
      kind: "line",
      paint: { stroke: 0 },
      arrowhead: true,
    }));
  }

  return result;
}

export const horizontalFlowPattern: PatternDefinition = {
  label: "フロー図（横型）",
  layout: (outline) => layoutHorizontalFlow(outline),
};
