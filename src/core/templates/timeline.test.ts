import { describe, expect, it } from "vitest";
import { layoutTimeline } from "./timeline";
import type { OutlineNode } from "../model/document";
import { paintOf, fillSlotOf } from "./layoutNode";

function node(id: string, text: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text, children };
}

// An event with a pre-filled time child plus its own description text - the
// shape a fresh root node (sync.ts) is prefilled with.
function event(id: string, description: string, time: string): OutlineNode {
  return node(id, description, [node(`${id}-time`, time)]);
}

describe("layoutTimeline", () => {
  it("returns nothing for an empty outline with no title", () => {
    expect(layoutTimeline([], "")).toEqual([]);
  });

  it("renders one dot, one time label, and one description per event", () => {
    const outline = [event("e1", "出社。メールと社内スケジュールの確認。", "9:00")];
    const layout = layoutTimeline(outline, "");
    const dot = layout.find((l) => l.kind === "ellipse")!;
    expect(dot.nodeIds).toEqual(["e1"]);
    expect(fillSlotOf(dot)).toBe(0);

    const time = layout.find((l) => l.nodeIds.includes("e1-time"))!;
    expect(time.text).toBe("9:00");
    expect(time.fontWeight).toBe("bold");

    const desc = layout.find((l) => l.kind === "label" && l.nodeIds.includes("e1") && l.text === "出社。メールと社内スケジュールの確認。")!;
    expect(desc).toBeDefined();
  });

  it("stacks events top to bottom", () => {
    const outline = [event("e1", "1", "9:00"), event("e2", "2", "9:10")];
    const layout = layoutTimeline(outline, "");
    const dot1 = layout.find((l) => l.kind === "ellipse" && l.nodeIds.includes("e1"))!;
    const dot2 = layout.find((l) => l.kind === "ellipse" && l.nodeIds.includes("e2"))!;
    expect(dot2.y).toBeGreaterThan(dot1.y);
  });

  it("every row shares the same fixed height regardless of description length", () => {
    const outline = [event("e1", "短い", "9:00"), event("e2", "とても長い説明文がここに入るケース", "9:10")];
    const layout = layoutTimeline(outline, "");
    const dot1 = layout.find((l) => l.kind === "ellipse" && l.nodeIds.includes("e1"))!;
    const dot2 = layout.find((l) => l.kind === "ellipse" && l.nodeIds.includes("e2"))!;
    expect(dot2.y - dot1.y).toBeGreaterThan(0);
    // Adding a 3rd event should advance by the exact same amount again.
    const outline3 = [...outline, event("e3", "3", "9:20")];
    const layout3 = layoutTimeline(outline3, "");
    const dot2b = layout3.find((l) => l.kind === "ellipse" && l.nodeIds.includes("e2"))!;
    const dot3 = layout3.find((l) => l.kind === "ellipse" && l.nodeIds.includes("e3"))!;
    expect(dot3.y - dot2b.y).toBe(dot2.y - dot1.y);
  });

  it("draws exactly one gray, thick, arrow-tipped track line spanning from the first to past the last dot", () => {
    const outline = [event("e1", "1", "9:00"), event("e2", "2", "9:10"), event("e3", "3", "9:20")];
    const layout = layoutTimeline(outline, "");
    const tracks = layout.filter((l) => l.kind === "line" && paintOf(l) === "track");
    expect(tracks).toHaveLength(1);
    expect(tracks[0].arrowhead).toBe(true);
    expect(tracks[0].nodeIds).toEqual([]);

    const dot1 = layout.find((l) => l.kind === "ellipse" && l.nodeIds.includes("e1"))!;
    const dot3 = layout.find((l) => l.kind === "ellipse" && l.nodeIds.includes("e3"))!;
    const trackTop = tracks[0].y;
    const trackBottom = tracks[0].y + tracks[0].height;
    expect(trackTop).toBeCloseTo(dot1.y + dot1.height / 2);
    expect(trackBottom).toBeGreaterThan(dot3.y + dot3.height / 2);
  });

  it("renders the title flanked by two dashed rules, with no textColorSlot override, and pushes the events below it", () => {
    const outline = [event("e1", "1", "9:00"), event("e2", "2", "9:10")];
    const withTitle = layoutTimeline(outline, "1日のスケジュール");
    const withoutTitle = layoutTimeline(outline, "");
    const title = withTitle.find((l) => l.text === "1日のスケジュール")!;
    expect(title.textColorSlot).toBeUndefined();
    expect(title.align).toBe("center");
    expect(title.nodeIds).toEqual([]);

    const rules = withTitle.filter((l) => l.kind === "line" && paintOf(l) !== "track");
    expect(rules).toHaveLength(2);

    const dotWithTitle = withTitle.find((l) => l.kind === "ellipse" && l.nodeIds.includes("e1"))!;
    const dotWithoutTitle = withoutTitle.find((l) => l.kind === "ellipse" && l.nodeIds.includes("e1"))!;
    expect(dotWithTitle.y).toBeGreaterThan(dotWithoutTitle.y);
  });

  it("renders only the title (no rows, no track) when the outline is empty", () => {
    const layout = layoutTimeline([], "1日のスケジュール");
    expect(layout.some((l) => l.kind === "ellipse")).toBe(false);
    expect(layout.some((l) => l.kind === "line" && paintOf(l) === "track")).toBe(false);
    expect(layout.some((l) => l.text === "1日のスケジュール")).toBe(true);
  });

  it("handles an event missing its time child without throwing (defensive)", () => {
    const outline = [node("e1", "時刻なし", [])];
    expect(() => layoutTimeline(outline, "")).not.toThrow();
    const layout = layoutTimeline(outline, "");
    const time = layout.find((l) => l.fontWeight === "bold" && l.depth === 1)!;
    expect(time.text).toBe("");
    expect(time.nodeIds).toEqual([]);
  });
});
