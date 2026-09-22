import { describe, expect, it } from "vitest";
import { dateToGridX, layoutSchedule } from "./schedule";
import type { OutlineNode } from "../model/document";
import type { ScheduleParams } from "./schedule";

function node(id: string, text: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text, children };
}

function bar(id: string, text: string, start: string, end: string): OutlineNode {
  return node(id, text, [node(`${id}-start`, start), node(`${id}-end`, end)]);
}

function row(id: string, text: string, bars: OutlineNode[]): OutlineNode {
  return node(id, text, bars);
}

function baseParams(overrides: Partial<ScheduleParams> = {}): ScheduleParams {
  return { startYear: 2018, startMonth: 6, columnCount: 7, milestones: [], connections: {}, ...overrides };
}

describe("dateToGridX", () => {
  it("maps the first day of the start month to 0", () => {
    expect(dateToGridX("2018-06-01", { startYear: 2018, startMonth: 6 })).toBe(0);
  });

  it("maps the first day of the next month to exactly one column width", () => {
    const oneMonth = dateToGridX("2018-07-01", { startYear: 2018, startMonth: 6 })!;
    const twoMonths = dateToGridX("2018-08-01", { startYear: 2018, startMonth: 6 })!;
    expect(twoMonths - oneMonth).toBeCloseTo(oneMonth); // uniform column width
  });

  it("positions a mid-month date proportionally within its month", () => {
    // June 2018 has 30 days; the 16th is roughly halfway through.
    const juneStart = dateToGridX("2018-06-01", { startYear: 2018, startMonth: 6 })!;
    const juneMid = dateToGridX("2018-06-16", { startYear: 2018, startMonth: 6 })!;
    const julyStart = dateToGridX("2018-07-01", { startYear: 2018, startMonth: 6 })!;
    expect(juneMid).toBeGreaterThan(juneStart);
    expect(juneMid).toBeLessThan(julyStart);
  });

  it("handles a year rollover (December -> January)", () => {
    const dec = dateToGridX("2018-12-01", { startYear: 2018, startMonth: 6 })!;
    const jan = dateToGridX("2019-01-01", { startYear: 2018, startMonth: 6 })!;
    expect(jan).toBeGreaterThan(dec);
  });

  it("returns null for an unparseable date", () => {
    expect(dateToGridX("not-a-date", { startYear: 2018, startMonth: 6 })).toBeNull();
    expect(dateToGridX(undefined, { startYear: 2018, startMonth: 6 })).toBeNull();
  });
});

describe("layoutSchedule", () => {
  it("returns just the header/grid scaffolding for an empty outline", () => {
    const layout = layoutSchedule([], baseParams());
    expect(layout.some((l) => l.text === "2018年")).toBe(true);
    expect(layout.filter((l) => l.text.endsWith("月"))).toHaveLength(7);
  });

  it("places a bar between its start and end date x-positions", () => {
    const outline = [row("r1", "行1", [bar("b1", "タスクA", "2018-06-01", "2018-06-29")])];
    const layout = layoutSchedule(outline, baseParams());
    const barLayout = layout.find((l) => l.nodeIds.includes("b1"))!;
    const juneStartX = dateToGridX("2018-06-01", baseParams())!;
    const juneEndX = dateToGridX("2018-06-29", baseParams())!;
    expect(barLayout.width).toBeCloseTo(juneEndX - juneStartX);
  });

  it("skips a bar with a missing or unparseable date instead of throwing", () => {
    const outline = [row("r1", "行1", [node("b1", "未入力", [node("s", ""), node("e", "")])])];
    expect(() => layoutSchedule(outline, baseParams())).not.toThrow();
    const layout = layoutSchedule(outline, baseParams());
    expect(layout.find((l) => l.nodeIds.includes("b1"))).toBeUndefined();
  });

  it("stacks rows top to bottom in outline order", () => {
    const outline = [
      row("r1", "行1", [bar("b1", "A", "2018-06-01", "2018-06-10")]),
      row("r2", "行2", [bar("b2", "B", "2018-06-01", "2018-06-10")]),
    ];
    const layout = layoutSchedule(outline, baseParams());
    const row1Label = layout.find((l) => l.nodeIds.includes("r1"))!;
    const row2Label = layout.find((l) => l.nodeIds.includes("r2"))!;
    expect(row2Label.y).toBeGreaterThan(row1Label.y);
  });

  it("places a milestone's triangle/label at its own date's x position, with no vertical guideline", () => {
    const layout = layoutSchedule([], baseParams({ milestones: [{ date: "2018-06-29", label: "中間報告書①" }] }));
    const triangle = layout.find((l) => l.kind === "polygon")!;
    const label = layout.find((l) => l.kind === "label" && l.text === "中間報告書①(6/29)")!;
    expect(triangle).toBeDefined();
    expect(label).toBeDefined();
    // No standalone vertical line dropping from the marker (removed per
    // feedback: it read as visual clutter, not useful information).
    expect(layout.some((l) => l.kind === "line" && l.width === 0 && l.height > 0)).toBe(false);

    const milestoneX = dateToGridX("2018-06-29", baseParams());
    const triangleCenterX = triangle.x + triangle.width / 2;
    expect(triangleCenterX - (44 + 260)).toBeCloseTo(milestoneX!); // gridLeft = ROW_NUMBER_WIDTH + ROW_LABEL_WIDTH
  });

  it("places the milestone label directly above its own triangle, not floating up into the month header", () => {
    const layout = layoutSchedule([], baseParams({ milestones: [{ date: "2018-06-29", label: "中間報告書①" }] }));
    const triangle = layout.find((l) => l.kind === "polygon")!;
    const label = layout.find((l) => l.kind === "label" && l.text === "中間報告書①(6/29)")!;
    const monthHeader = layout.find((l) => l.text === "6月")!;

    // The label's bottom edge should sit right at (or just above) the
    // triangle's top edge - not with a large gap in between (the reported
    // bug: the label floated far above the triangle).
    const gap = triangle.y - (label.y + label.height);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(10);

    // And the label must not overlap the month header above it.
    expect(label.y).toBeGreaterThanOrEqual(monthHeader.y + monthHeader.height);
  });

  it("skips a milestone with an unparseable date instead of throwing", () => {
    expect(() => layoutSchedule([], baseParams({ milestones: [{ date: "", label: "x" }] }))).not.toThrow();
    const layout = layoutSchedule([], baseParams({ milestones: [{ date: "", label: "x" }] }));
    expect(layout.some((l) => l.text === "x")).toBe(false);
  });

  it("draws a single direct arrow between two bars in the same row", () => {
    const outline = [row("r1", "行1", [bar("b1", "A", "2018-06-01", "2018-06-10"), bar("b2", "B", "2018-06-15", "2018-06-25")])];
    const layout = layoutSchedule(outline, baseParams({ connections: { b1: "b2" } }));
    const connectorLines = layout.filter((l) => l.kind === "line" && l.dashed === false);
    expect(connectorLines).toHaveLength(1);
    expect(connectorLines[0].height).toBe(0); // purely horizontal - same row
    expect(connectorLines[0].arrowhead).toBe(true);
  });

  it("draws a simplified 2-segment connector (rightward stub + downward arrow) between bars in different rows", () => {
    const outline = [
      row("r1", "行1", [bar("b1", "A", "2018-06-01", "2018-06-10")]),
      row("r2", "行2", [bar("b2", "B", "2018-07-01", "2018-07-10")]),
    ];
    const layout = layoutSchedule(outline, baseParams({ connections: { b1: "b2" } }));
    const connectorLines = layout.filter((l) => l.kind === "line" && l.dashed === false);
    expect(connectorLines).toHaveLength(2);
    // A short rightward stub (no arrowhead) then a downward arrow.
    expect(connectorLines[0].height).toBe(0);
    expect(connectorLines[0].arrowhead).toBeFalsy();
    expect(connectorLines[1].width).toBe(0);
    expect(connectorLines[1].arrowhead).toBe(true);
    // The arrow lands exactly on the target's top edge (y === 0 offset from
    // its own row), not necessarily its exact start x.
    const targetBar = layout.find((l) => l.nodeIds.includes("b2"))!;
    expect(connectorLines[1].y + connectorLines[1].height).toBe(targetBar.y);
  });

  it("keeps the connector's turning point within a short, fixed stub past the target's start rather than a wide midpoint jog", () => {
    const outline = [
      row("r1", "行1", [bar("b1", "A", "2018-06-01", "2018-06-10")]),
      row("r2", "行2", [bar("b2", "B", "2018-12-01", "2018-12-10")]), // far to the right
    ];
    const layout = layoutSchedule(outline, baseParams({ connections: { b1: "b2" } }));
    const targetBar = layout.find((l) => l.nodeIds.includes("b2"))!;
    const connectorLines = layout.filter((l) => l.kind === "line" && l.dashed === false);
    const turnX = connectorLines[0].x + connectorLines[0].width;
    // Close to the target's own start, not halfway across the whole chart.
    expect(turnX).toBeGreaterThanOrEqual(targetBar.x);
    expect(turnX).toBeLessThan(targetBar.x + targetBar.width);
  });

  it("ignores a connection referencing a bar that doesn't exist (or wasn't rendered) instead of throwing", () => {
    const outline = [row("r1", "行1", [bar("b1", "A", "2018-06-01", "2018-06-10")])];
    expect(() => layoutSchedule(outline, baseParams({ connections: { b1: "missing" } }))).not.toThrow();
    const layout = layoutSchedule(outline, baseParams({ connections: { b1: "missing" } }));
    expect(layout.filter((l) => l.dashed === false)).toHaveLength(0);
  });

  it("draws one vertical grid line per month-column boundary (columnCount + 1)", () => {
    const layout = layoutSchedule([row("r1", "行1", [])], baseParams({ columnCount: 3 }));
    const verticalLines = layout.filter((l) => l.kind === "line" && l.width === 0 && l.dashed !== false && l.nodeIds.length === 0);
    // Exclude milestone guidelines (none configured here), so every width-0
    // undashed-unset line is a month-boundary grid line.
    expect(verticalLines).toHaveLength(4);
  });
});
