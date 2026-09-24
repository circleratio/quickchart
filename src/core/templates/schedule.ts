import type { OutlineNode } from "../model/document";
import { decoration, fixedText, textNode } from "./layoutNode";
import type { LayoutNode } from "./layoutNode";
import { DOWN_TRIANGLE_POINTS } from "./parts/polygon";
import { emptyNode, emptyNodes } from "./patternDefinition";
import type { PatternDefinition, RawParams } from "./patternDefinition";

const ROW_NUMBER_WIDTH = 44;
const ROW_LABEL_WIDTH = 260;
const MONTH_COLUMN_WIDTH = 170;
const YEAR_HEADER_HEIGHT = 32;
const MONTH_HEADER_HEIGHT = 32;
const MILESTONE_LABEL_HEIGHT = 20;
const MILESTONE_TRIANGLE_SIZE = 12;
// Small vertical breathing room between the label and the triangle it names -
// not a whole separate "milestone area" band (see MILESTONE_AREA_HEIGHT
// below); the label sits directly on top of its triangle, not floating
// further up into the month header (the originally reported bug).
const MILESTONE_LABEL_GAP = 2;
const MILESTONE_AREA_HEIGHT = MILESTONE_TRIANGLE_SIZE + MILESTONE_LABEL_GAP + MILESTONE_LABEL_HEIGHT;
const ROW_HEIGHT = 90;
const BAR_HEIGHT = 50;
const BAR_MIN_WIDTH = 24;
const HEADER_FONT_SIZE = 15;
const MILESTONE_FONT_SIZE = 12;
// The short horizontal "stub" a dependency connector runs before turning to
// go down into a later row (doc/spec.md §6.2.6) - deliberately small and
// fixed rather than proportional to the gap between bars, so a chart with
// many dependencies at different dates doesn't turn into a maze of
// differently-angled elbows.
const CONNECTOR_STUB = 16;

export interface Milestone {
  date: string; // "YYYY-MM-DD"
  label: string;
}

export interface ScheduleParams {
  startYear: number;
  startMonth: number; // 1-12
  columnCount: number;
  milestones: Milestone[];
  // barNodeId -> the id of the bar it connects to (doc/spec.md §6.2.6) - a
  // flat relation kept in params rather than the outline tree, since a
  // dependency can point at a bar in any other row, not just a parent/child.
  connections: Record<string, string>;
}

interface ParsedDate {
  year: number;
  month: number; // 1-12
  day: number;
}

function parseDate(value: string | undefined): ParsedDate | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  return { year: Number(y), month: Number(m), day: Number(d) };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// "MM/DD" (no zero-padding, matching the "6/29" style consulting decks
// actually use) for the milestone label suffix below - null if unparseable.
function formatMonthDay(dateStr: string | undefined): string | null {
  const date = parseDate(dateStr);
  return date ? `${date.month}/${date.day}` : null;
}

// Maps a "YYYY-MM-DD" date to an x offset from the grid's own left edge
// (fractional position within its month, times MONTH_COLUMN_WIDTH) - null if
// unparseable. Dates outside [startMonth, startMonth+columnCount) are not
// clamped: they render outside the grid rather than silently snapping into
// it, which is more informative when a date was mistyped.
export function dateToGridX(dateStr: string | undefined, params: Pick<ScheduleParams, "startYear" | "startMonth">): number | null {
  const date = parseDate(dateStr);
  if (!date) return null;
  const monthIndex = (date.year - params.startYear) * 12 + (date.month - params.startMonth);
  const fraction = (date.day - 1) / daysInMonth(date.year, date.month);
  return (monthIndex + fraction) * MONTH_COLUMN_WIDTH;
}

function gridLeft(): number {
  return ROW_NUMBER_WIDTH + ROW_LABEL_WIDTH;
}

interface ConnectorSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  arrowhead: boolean;
}

// One bar-to-bar dependency connector, deliberately simplified to read
// clearly rather than route precisely (doc/spec.md §6.2.6): assuming later
// work sits in a row below earlier work (top-to-bottom order), a
// cross-row dependency is just a short rightward stub from the source's
// right edge, then a single downward arrow - not a mid-point-based elbow
// that lands exactly on the target's own start. The arrow's x is the source's
// right edge (or, if the target starts further right, the target's own left
// edge instead) plus one CONNECTOR_STUB, which - given bars are always at
// least BAR_MIN_WIDTH wide - normally lands somewhere over the target's own
// span without needing to hit its exact start point. A same-row dependency
// (both bars at the same y) stays a single direct rightward arrow, since
// there's no "row order" ambiguity to simplify away there.
function connectionSegments(from: LayoutNode, to: LayoutNode): ConnectorSegment[] {
  const fromRightX = from.x + from.width;
  const fromY = from.y + from.height / 2;

  if (from.y === to.y) {
    return [{ x1: fromRightX, y1: fromY, x2: to.x, y2: fromY, arrowhead: true }];
  }

  const dropX = Math.max(fromRightX, to.x) + CONNECTOR_STUB;
  return [
    { x1: fromRightX, y1: fromY, x2: dropX, y2: fromY, arrowhead: false },
    { x1: dropX, y1: fromY, x2: dropX, y2: to.y, arrowhead: true },
  ];
}

// "ガントチャート" (doc/spec.md §6.2.6): a Gantt-style schedule chart. Root
// outline nodes (depth 0) are rows; each root's children (depth 1) are that
// row's bars, positioned by real calendar dates rather than incrementally
// placed or index-based like other patterns - a bar's own children (depth 2,
// position-based like pyramidChart's scale/cells) are child[0]=start date,
// child[1]=end date, both "YYYY-MM-DD" strings entered via dedicated date
// inputs (StructuredTextPanel.tsx) rather than free text. Month range
// (year/start month/column count) and the milestone markers along the top
// come from `params`, not the outline, for the same reason bulletMatrix's
// column headers do (doc/spec.md §6.2.4) - they have no natural outline
// position of their own.
export function layoutSchedule(outline: OutlineNode[], params: ScheduleParams): LayoutNode[] {
  const result: LayoutNode[] = [];
  const { startYear, startMonth, columnCount, milestones, connections } = params;
  const left = gridLeft();
  const gridWidth = columnCount * MONTH_COLUMN_WIDTH;
  const gridBottom = outline.length * ROW_HEIGHT;

  result.push(fixedText(`${startYear}年`, {
    x: left,
    y: -(MILESTONE_AREA_HEIGHT + MONTH_HEADER_HEIGHT + YEAR_HEADER_HEIGHT),
    width: gridWidth,
    height: YEAR_HEADER_HEIGHT,
    kind: "text",
    align: "center",
    fontSize: HEADER_FONT_SIZE,
    fontWeight: "bold",
  }));

  for (let i = 0; i < columnCount; i++) {
    const monthIndex0 = startMonth - 1 + i;
    const month = (monthIndex0 % 12) + 1;
    result.push(fixedText(`${month}月`, {
      x: left + i * MONTH_COLUMN_WIDTH,
      y: -(MILESTONE_AREA_HEIGHT + MONTH_HEADER_HEIGHT),
      width: MONTH_COLUMN_WIDTH,
      height: MONTH_HEADER_HEIGHT,
      kind: "text",
      align: "center",
      fontSize: HEADER_FONT_SIZE,
    }));
  }

  // Vertical grid lines - one per month-column boundary (columnCount + 1),
  // spanning the row-body area only (the header cells above already have
  // their own borders, same reasoning as bulletMatrix's grid - see
  // bulletMatrix.ts). Drawn before the rows/bars below so it renders
  // underneath them (see regenerateBlockShapes in materialize.ts).
  for (let i = 0; i <= columnCount; i++) {
    result.push(decoration({
      x: left + i * MONTH_COLUMN_WIDTH,
      y: 0,
      width: 0,
      height: gridBottom,
      kind: "line",
    }));
  }

  const barLayoutById = new Map<string, LayoutNode>();

  outline.forEach((row, i) => {
    const y = i * ROW_HEIGHT;

    result.push(fixedText(`(${i + 1})`, {
      x: 0,
      y,
      width: ROW_NUMBER_WIDTH,
      height: ROW_HEIGHT,
      kind: "text",
      align: "center",
    }));

    result.push(textNode(row, 0, {
      x: ROW_NUMBER_WIDTH,
      y,
      width: ROW_LABEL_WIDTH,
      height: ROW_HEIGHT,
      kind: "text",
      align: "left",
    }));

    row.children.forEach((bar) => {
      const startX = dateToGridX(bar.children[0]?.text, params);
      const endX = dateToGridX(bar.children[1]?.text, params);
      if (startX === null || endX === null) return;

      const barLayout: LayoutNode = textNode(bar, 1, {
        x: left + Math.min(startX, endX),
        y: y + (ROW_HEIGHT - BAR_HEIGHT) / 2,
        width: Math.max(BAR_MIN_WIDTH, Math.abs(endX - startX)),
        height: BAR_HEIGHT,
        kind: "text",
        align: "center",
      });
      result.push(barLayout);
      barLayoutById.set(bar.id, barLayout);
    });

    if (i < outline.length - 1) {
      result.push(decoration({
        x: left,
        y: y + ROW_HEIGHT,
        width: gridWidth,
        height: 0,
        kind: "line",
      }));
    }
  });

  for (const [fromId, toId] of Object.entries(connections)) {
    const from = barLayoutById.get(fromId);
    const to = barLayoutById.get(toId);
    if (!from || !to) continue;
    for (const { x1, y1, x2, y2, arrowhead } of connectionSegments(from, to)) {
      result.push(decoration({
        x: x1,
        y: y1,
        width: x2 - x1,
        height: y2 - y1,
        kind: "line",
        paint: { stroke: 0 },
        arrowhead,
      }));
    }
  }

  milestones.forEach((milestone) => {
    const x = dateToGridX(milestone.date, params);
    if (x === null) return;
    const absoluteX = left + x;
    // formatMonthDay can't fail here: dateToGridX above already parsed the
    // same milestone.date successfully.
    const monthDay = formatMonthDay(milestone.date)!;

    result.push(fixedText(`${milestone.label}(${monthDay})`, {
      x: absoluteX - MONTH_COLUMN_WIDTH / 2,
      y: -MILESTONE_AREA_HEIGHT,
      width: MONTH_COLUMN_WIDTH,
      height: MILESTONE_LABEL_HEIGHT,
      kind: "label",
      align: "center",
      fontSize: MILESTONE_FONT_SIZE,
    }));

    result.push(decoration({
      x: absoluteX - MILESTONE_TRIANGLE_SIZE / 2,
      y: -MILESTONE_TRIANGLE_SIZE,
      width: MILESTONE_TRIANGLE_SIZE,
      height: MILESTONE_TRIANGLE_SIZE,
      kind: "polygon",
      points: DOWN_TRIANGLE_POINTS,
      paint: { fill: 0 },
    }));
  });

  return result;
}

const SCHEDULE_DEFAULT_TODAY = new Date();
const SCHEDULE_DEFAULT_YEAR = SCHEDULE_DEFAULT_TODAY.getFullYear();
const SCHEDULE_DEFAULT_START_MONTH = SCHEDULE_DEFAULT_TODAY.getMonth() + 1; // Date's month is 0-indexed
const SCHEDULE_DEFAULT_COLUMN_COUNT = 6;

// The month range/milestones/dependency links all live in params, not the
// outline (doc/spec.md §6.2.6) - none of them have a natural position in the
// row/bar tree. Defaults start from this month so a freshly added block
// renders something immediately relevant before the user sets real values.
export function scheduleParams(params: RawParams): ScheduleParams {
  const startYear = typeof params.startYear === "number" ? params.startYear : SCHEDULE_DEFAULT_YEAR;
  const rawStartMonth = typeof params.startMonth === "number" ? params.startMonth : SCHEDULE_DEFAULT_START_MONTH;
  const startMonth = Math.min(12, Math.max(1, rawStartMonth));
  const rawColumnCount = typeof params.columnCount === "number" ? params.columnCount : SCHEDULE_DEFAULT_COLUMN_COUNT;
  const columnCount = Math.max(1, Math.round(rawColumnCount));
  const milestones = Array.isArray(params.milestones)
    ? params.milestones.filter((m): m is Milestone => typeof m === "object" && m !== null && typeof m.date === "string" && typeof m.label === "string")
    : [];
  const connections =
    typeof params.connections === "object" && params.connections !== null && !Array.isArray(params.connections)
      ? Object.fromEntries(
          Object.entries(params.connections as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        )
      : {};
  return { startYear, startMonth, columnCount, milestones, connections };
}

// A bar's 2 children are position-based: child[0]=start date, child[1]=end
// date, both "YYYY-MM-DD" strings entered via dedicated date inputs rather
// than free text (see dateToGridX).
function emptyBar(): OutlineNode {
  return emptyNode(emptyNodes(2));
}

export const schedulePattern: PatternDefinition = {
  label: "ガントチャート",
  layout: (outline, params) => layoutSchedule(outline, scheduleParams(params)),
  // Month headers and milestones are placed above row 0.
  normalizeOrigin: true,
  // A bar's date fields have no shape of their own - editing one decides
  // whether and where its bar renders.
  regenerateOnTextEdit: "panel",
  // A row starts with one bar, so the outline editor has something
  // bar-shaped to expand into; a new child of a row is a new bar.
  newRoot: () => emptyNode([emptyBar()]),
  newChild: (outline, parentNodeId) => (outline.some((row) => row.id === parentNodeId) ? emptyBar() : undefined),
  // Bars need date fields and a connects-to picker (doc/spec.md §6.2.6).
  customEditor: "schedule",
};
