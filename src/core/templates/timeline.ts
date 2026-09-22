import type { OutlineNode } from "../model/document";
import type { LayoutNode } from "./treeLayout";

const DOT_SIZE = 18;
const DOT_GAP = 26;
const TIME_WIDTH = 90;
const TIME_FONT_SIZE = 20;
const TIME_LABEL_HEIGHT = 32;
const CONTENT_GAP = 24;
const CONTENT_WIDTH = 760;
const CONTENT_FONT_SIZE = 16;
const CONTENT_LABEL_HEIGHT = 28;
const ROW_HEIGHT = 78;
// How far the track line's arrowhead extends past the last dot's center.
const TRACK_TAIL = 40;

const TOTAL_WIDTH = DOT_SIZE + DOT_GAP + TIME_WIDTH + CONTENT_GAP + CONTENT_WIDTH;

const TITLE_HEIGHT = 34;
const TITLE_GAP = 44;
const TITLE_BAND_WIDTH = 300;
const TITLE_FONT_SIZE = 28;
const TITLE_LINE_GAP = 16;

// "タイムライン" (doc/spec.md §6.2.11): a vertical list of time-stamped events
// (e.g. a day's schedule) - a filled dot per event sitting on one continuous
// gray track (arrow-tipped at the bottom), a bold time label to its right,
// and a plain description on the same line, under the same optional
// flanking-dashed-rule title as flowSchedule (§6.2.9). Root outline nodes
// (depth 0) are events in order; a root's own text is the event's
// description (the main content, like verticalFlow's title - §6.2.7), and
// child[0] (position-based, like verticalFlow's badge) is the time label -
// free text rather than derived, since a schedule's times aren't evenly
// spaced or auto-incrementing.
export function layoutTimeline(outline: OutlineNode[], title: string): LayoutNode[] {
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
      // No textColorSlot override - see flowSchedule.ts's own title for why
      // (reads the same primary color as everything else, not an accent).
    });

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

  if (outline.length === 0) return result;

  const rowCenterY = (i: number) => y + i * ROW_HEIGHT + ROW_HEIGHT / 2;

  // The track line first, so it renders underneath the dots drawn on top of
  // it (see regenerateBlockShapes in sync.ts) - same ordering reason as
  // matrix.ts's background square. One continuous connector spanning every
  // event (not one segment per adjacent pair, unlike verticalFlow's badge
  // arrows - doc/spec.md §6.2.7) since the reference image reads as a single
  // uninterrupted axis, not discrete links between stops.
  result.push({
    nodeIds: [],
    text: "",
    depth: 0,
    x: DOT_SIZE / 2,
    y: rowCenterY(0),
    width: 0,
    height: rowCenterY(outline.length - 1) + TRACK_TAIL - rowCenterY(0),
    kind: "line",
    trackStyle: true,
    arrowhead: true,
  });

  outline.forEach((event, i) => {
    const cy = rowCenterY(i);
    const timeNode = event.children[0];

    // The dot has no text of its own - it shares the event's nodeId with the
    // description label below anyway (same convention as horizontalFlow's
    // step circles - §6.2.8), so a click on either selects the same event.
    result.push({
      nodeIds: [event.id],
      text: "",
      depth: 0,
      x: 0,
      y: cy - DOT_SIZE / 2,
      width: DOT_SIZE,
      height: DOT_SIZE,
      kind: "ellipse",
      fillColorSlot: 0,
    });

    result.push({
      nodeIds: timeNode ? [timeNode.id] : [],
      text: timeNode?.text ?? "",
      depth: 1,
      x: DOT_SIZE + DOT_GAP,
      y: cy - TIME_LABEL_HEIGHT / 2,
      width: TIME_WIDTH,
      height: TIME_LABEL_HEIGHT,
      kind: "label",
      align: "left",
      fontWeight: "bold",
      fontSize: TIME_FONT_SIZE,
    });

    result.push({
      nodeIds: [event.id],
      text: event.text,
      depth: 0,
      x: DOT_SIZE + DOT_GAP + TIME_WIDTH + CONTENT_GAP,
      y: cy - CONTENT_LABEL_HEIGHT / 2,
      width: CONTENT_WIDTH,
      height: CONTENT_LABEL_HEIGHT,
      kind: "label",
      align: "left",
      fontSize: CONTENT_FONT_SIZE,
    });
  });

  return result;
}
