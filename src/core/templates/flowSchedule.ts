import type { OutlineNode } from "../model/document";
import type { LayoutNode } from "./treeLayout";

const HEADING_WIDTH = 220;
const CONTENT_WIDTH = 680;
const TOTAL_WIDTH = HEADING_WIDTH + CONTENT_WIDTH;
const ROW_MIN_HEIGHT = 72;
const ROW_PADDING_Y = 20;
// Trimmed off the bottom of each heading cell so adjacent rows' identically
// colored heading blocks don't visually fuse into one band - same trick as
// headingBullets' HEADING_GAP (see headingBullets.ts).
const HEADING_GAP = 4;
const HEADING_FONT_SIZE = 16;
const CONTENT_PADDING_X = 28;
const CONTENT_RIGHT_PADDING = 24;
const DESC_LINE_HEIGHT = 24;
const DESC_FONT_SIZE = 14;
const TITLE_HEIGHT = 30;
const TITLE_GAP = 26;
const TITLE_BAND_WIDTH = 340;
const TITLE_FONT_SIZE = 22;
// Horizontal breathing room between the title text band and the flanking
// dashed rules on either side of it.
const TITLE_LINE_GAP = 16;

// The "01" etc. row number: rendered as a `bulletMarker` prefix on the row's
// own heading shape (treeLayout.ts's LayoutNode.bulletMarker), not baked into
// the shape's editable `content` - same mechanism headingBullets/bulletMatrix
// use for their "• "/"- " prefixes. This keeps the heading's real content
// exactly `row.text` (so a plain text edit patches it the normal way, no
// special-casing in sync.ts's updateOutlineNodeText needed) while the number
// itself stays purely position-derived, redrawn correctly whenever the row's
// index changes (add/delete/reorder - all full-regenerate for this pattern,
// see isFullyRelayoutedPattern in sync.ts).
function rowNumberPrefix(index: number): string {
  return `${String(index + 1).padStart(2, "0")} | `;
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
  const result: LayoutNode[] = [];
  let y = 0;

  const trimmedTitle = title.trim();
  if (trimmedTitle) {
    const bandWidth = Math.min(TITLE_BAND_WIDTH, TOTAL_WIDTH);
    const bandX = (TOTAL_WIDTH - bandWidth) / 2;
    result.push({
      nodeIds: [],
      text: trimmedTitle,
      depth: 0,
      x: bandX,
      y: 0,
      width: bandWidth,
      height: TITLE_HEIGHT,
      kind: "label",
      align: "center",
      fontWeight: "bold",
      fontSize: TITLE_FONT_SIZE,
      textColorSlot: "accent",
    });

    // Dashed rules filling the rest of the title row on either side of the
    // text band, same "line" kind/default dash as the row separators below -
    // only drawn if there's actually room for them (a very wide title band
    // could otherwise produce a negative-width line).
    const lineY = TITLE_HEIGHT / 2;
    const leftWidth = bandX - TITLE_LINE_GAP;
    if (leftWidth > 0) {
      result.push({ nodeIds: [], text: "", depth: 0, x: 0, y: lineY, width: leftWidth, height: 0, kind: "line" });
      result.push({
        nodeIds: [],
        text: "",
        depth: 0,
        x: bandX + bandWidth + TITLE_LINE_GAP,
        y: lineY,
        width: TOTAL_WIDTH - (bandX + bandWidth + TITLE_LINE_GAP),
        height: 0,
        kind: "line",
      });
    }

    y = TITLE_HEIGHT + TITLE_GAP;
  }

  outline.forEach((row, i) => {
    const descCount = row.children.length;
    const contentHeight = descCount * DESC_LINE_HEIGHT;
    const rowHeight = Math.max(ROW_MIN_HEIGHT, contentHeight + ROW_PADDING_Y * 2);

    result.push({
      nodeIds: [row.id],
      text: row.text,
      depth: 0,
      x: 0,
      y,
      width: HEADING_WIDTH,
      height: rowHeight - HEADING_GAP,
      kind: "heading",
      fontSize: HEADING_FONT_SIZE,
      bulletMarker: rowNumberPrefix(i),
    });

    const descStartY = y + (rowHeight - contentHeight) / 2;
    row.children.forEach((desc, j) => {
      result.push({
        nodeIds: [desc.id],
        text: desc.text,
        depth: 1,
        x: HEADING_WIDTH + CONTENT_PADDING_X,
        y: descStartY + j * DESC_LINE_HEIGHT,
        width: CONTENT_WIDTH - CONTENT_PADDING_X - CONTENT_RIGHT_PADDING,
        height: DESC_LINE_HEIGHT,
        kind: "label",
        align: "left",
        fontSize: DESC_FONT_SIZE,
      });
    });

    y += rowHeight;

    // Dashed separator between this row and the next (not above the first or
    // below the last), spanning only the content column - same reasoning as
    // headingBullets' separator (the heading column is one continuous band of
    // identical color across every row, so a seam there wouldn't show).
    if (i < outline.length - 1) {
      result.push({
        nodeIds: [],
        text: "",
        depth: 0,
        x: HEADING_WIDTH,
        y,
        width: CONTENT_WIDTH,
        height: 0,
        kind: "line",
      });
    }
  });

  return result;
}
