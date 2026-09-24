import type { OutlineNode } from "../model/document";
import type { LayoutNode } from "./layoutNode";
import { headingRows } from "./parts/headingRows";
import { lineStack, lineStackHeight } from "./parts/lineStack";
import { stepNumber } from "./parts/numbering";
import { ruledTitle } from "./parts/ruledTitle";
import { stringParam } from "./patternDefinition";
import type { PatternDefinition } from "./patternDefinition";

const HEADING_WIDTH = 220;
const CONTENT_WIDTH = 680;
const TOTAL_WIDTH = HEADING_WIDTH + CONTENT_WIDTH;
const ROW_MIN_HEIGHT = 72;
const ROW_PADDING_Y = 20;
const HEADING_FONT_SIZE = 16;
const CONTENT_PADDING_X = 28;
const CONTENT_RIGHT_PADDING = 24;
const DESC_LINE_HEIGHT = 24;
const DESC_FONT_SIZE = 14;
const TITLE_HEIGHT = 30;
const TITLE_GAP = 26;
const TITLE_BAND_WIDTH = 340;
const TITLE_FONT_SIZE = 22;

// The "01" etc. row number: rendered as a `bulletMarker` prefix on the row's
// own heading shape (layoutNode.ts's LayoutNode.bulletMarker), not baked into
// the shape's editable `content` - same mechanism headingBullets/bulletMatrix
// use for their "• "/"- " prefixes. This keeps the heading's real content
// exactly `row.text` (so a plain text edit patches it the normal way, no
// special-casing in sync.ts's updateOutlineNodeText needed) while the number
// itself stays purely position-derived, redrawn correctly whenever the row's
// index changes (add/delete/reorder - all full-regenerate for this pattern,
// see isFullyRelayoutedPattern in sync.ts).
function rowNumberPrefix(index: number): string {
  return `${stepNumber(index)} | `;
}

// "フロースケジュール（縦）" (doc/spec.md §6.2.9): a vertical numbered list of
// steps (e.g. an inquiry-to-onboarding flow), each row a colored heading cell
// ("01 | お問い合わせ") on the left and a plain description on the right,
// separated row-to-row by a dashed rule - headingBullets (§6.2.3) with an
// auto-numbered heading and no bullet markers on the description lines, plus
// an optional overall title flanked by dashed rules. Root outline nodes
// (depth 0) are rows in order; a root's own text is the row's heading label
// (the leading "NN | " is generated, not part of the text), and its children
// are description lines stacked - and, when there's more than one, vertically
// centered as a block - in the content column (no bullet marker, unlike
// headingBullets' bulleted items, since the reference image's description
// column is plain running text).
export function layoutFlowSchedule(outline: OutlineNode[], title: string): LayoutNode[] {
  const titleNodes = ruledTitle(title, TOTAL_WIDTH, { bandWidth: TITLE_BAND_WIDTH, height: TITLE_HEIGHT, fontSize: TITLE_FONT_SIZE });
  const rows = headingRows(outline, {
    top: titleNodes.length > 0 ? TITLE_HEIGHT + TITLE_GAP : 0,
    headingWidth: HEADING_WIDTH,
    separatorWidth: CONTENT_WIDTH,
    minRowHeight: ROW_MIN_HEIGHT,
    paddingY: ROW_PADDING_Y,
    heading: (_row, i) => ({ fontSize: HEADING_FONT_SIZE, bulletMarker: rowNumberPrefix(i) }),
    contentHeight: (row) => lineStackHeight(row.children.length, DESC_LINE_HEIGHT),
    content: (row, _i, rowTop, rowHeight) =>
      lineStack(row.children, {
        x: HEADING_WIDTH + CONTENT_PADDING_X,
        y: rowTop + (rowHeight - lineStackHeight(row.children.length, DESC_LINE_HEIGHT)) / 2,
        width: CONTENT_WIDTH - CONTENT_PADDING_X - CONTENT_RIGHT_PADDING,
        lineHeight: DESC_LINE_HEIGHT,
        depth: 1,
        props: { kind: "label", align: "left", fontSize: DESC_FONT_SIZE },
      }),
  });
  return [...titleNodes, ...rows];
}

export const flowSchedulePattern: PatternDefinition = {
  layout: (outline, params) => layoutFlowSchedule(outline, stringParam(params, "title")),
  // Row separators/title rules are untracked, and each heading's "NN | "
  // number depends on its index.
  restructure: "regenerate",
};
