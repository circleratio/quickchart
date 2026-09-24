import { describe, expect, it } from "vitest";
import type { OutlineNode } from "../model/document";
import type { PatternId } from "./patternDefinition";
import { patternOf } from "./registry";

const PATTERN_IDS: PatternId[] = [
  "pyramid",
  "logicTree",
  "matrix",
  "venn",
  "headingBullets",
  "bulletMatrix",
  "pyramidChart",
  "schedule",
  "verticalFlow",
  "horizontalFlow",
  "flowSchedule",
  "flowScheduleHorizontal",
  "timeline",
  "beforeAfter",
  "beforeAfterHorizontal",
  "chevronFlow",
  "cycle",
  "cycleWithEntry",
  "gridMatrix",
];

function allIds(nodes: OutlineNode[]): string[] {
  return nodes.flatMap((n) => [n.id, ...allIds(n.children)]);
}

describe("pattern registry", () => {
  it.each(PATTERN_IDS)("%s lays out an empty block", (id) => {
    expect(() => patternOf(id).layout([], {})).not.toThrow();
  });

  it.each(PATTERN_IDS)("%s lays out its own prefilled outline", (id) => {
    const definition = patternOf(id);
    const params = { columnHeaders: ["A", "B"] };
    const outline = definition.initialOutline?.(params) ?? [definition.newRoot?.(params) ?? { id: "root", text: "", children: [] }];
    const ids = allIds(outline);
    expect(new Set(ids).size).toBe(ids.length);
    expect(() => definition.layout(outline, params)).not.toThrow();
  });

  it("gives only the tree patterns a growth direction", () => {
    expect(patternOf("pyramid").tree?.direction).toBe("down");
    expect(patternOf("logicTree").tree?.direction).toBe("right");
    expect(PATTERN_IDS.filter((id) => patternOf(id).tree)).toEqual(["pyramid", "logicTree"]);
  });
});
