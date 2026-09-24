import { describe, expect, it } from "vitest";
import type { OutlineNode } from "../../model/document";
import { headingRows } from "./headingRows";
import { lineStack, lineStackHeight } from "./lineStack";
import { stepNumber } from "./numbering";
import { polygonFromAbsolute } from "./polygon";
import { ruledTitle } from "./ruledTitle";

function node(id: string, children: OutlineNode[] = []): OutlineNode {
  return { id, text: id.toUpperCase(), children };
}

describe("ruledTitle", () => {
  const options = { bandWidth: 200, height: 30, fontSize: 20 };

  it("returns nothing for a blank title", () => {
    expect(ruledTitle("  ", 800, options)).toEqual([]);
  });

  it("centers the trimmed title and flanks it with rules filling the row", () => {
    const [title, left, right] = ruledTitle(" T ", 800, options);
    expect(title).toMatchObject({ nodeIds: [], text: "T", x: 300, y: 0, width: 200, height: 30, kind: "label" });
    expect(left).toMatchObject({ kind: "line", x: 0, y: 15, width: 284, height: 0 });
    expect(right).toMatchObject({ kind: "line", x: 516, y: 15, width: 284, height: 0 });
  });

  it("skips the rules when there is no room for them", () => {
    expect(ruledTitle("T", 0, options)).toHaveLength(1);
    expect(ruledTitle("T", 220, options)).toHaveLength(1);
  });
});

describe("lineStack", () => {
  it("stacks one label per node at a fixed pitch", () => {
    const nodes = lineStack([node("a"), node("b")], {
      x: 10,
      y: 20,
      width: 100,
      lineHeight: 24,
      gap: 4,
      depth: (i) => (i === 0 ? 1 : 2),
      props: { kind: "label", align: "left" },
    });
    expect(nodes).toEqual([
      { nodeIds: ["a"], text: "A", depth: 1, x: 10, y: 20, width: 100, height: 24, kind: "label", align: "left" },
      { nodeIds: ["b"], text: "B", depth: 2, x: 10, y: 48, width: 100, height: 24, kind: "label", align: "left" },
    ]);
  });

  it("measures the stack without a trailing gap", () => {
    expect(lineStackHeight(0, 24, 4)).toBe(0);
    expect(lineStackHeight(3, 24, 4)).toBe(80);
  });
});

describe("headingRows", () => {
  it("sizes each row by its content and separates rows with a rule", () => {
    const rows = [node("r1", [node("a"), node("b"), node("c")]), node("r2")];
    const nodes = headingRows(rows, {
      top: 10,
      headingWidth: 100,
      separatorWidth: 300,
      minRowHeight: 50,
      paddingY: 10,
      contentHeight: (row) => row.children.length * 20,
      content: () => [],
      heading: (_row, i) => ({ fontSize: 12 + i }),
    });
    expect(nodes).toEqual([
      { nodeIds: ["r1"], text: "R1", depth: 0, x: 0, y: 10, width: 100, height: 76, kind: "heading", fontSize: 12 },
      { nodeIds: [], text: "", depth: 0, x: 100, y: 90, width: 300, height: 0, kind: "line" },
      { nodeIds: ["r2"], text: "R2", depth: 0, x: 0, y: 90, width: 100, height: 46, kind: "heading", fontSize: 13 },
    ]);
  });
});

describe("stepNumber", () => {
  it("zero-pads the 1-based index", () => {
    expect(stepNumber(0)).toBe("01");
    expect(stepNumber(11)).toBe("12");
  });
});

describe("polygonFromAbsolute", () => {
  it("returns the bounding box and vertices as fractions of it", () => {
    expect(
      polygonFromAbsolute([
        { x: 10, y: 20 },
        { x: 30, y: 20 },
        { x: 20, y: 60 },
      ]),
    ).toEqual({
      x: 10,
      y: 20,
      width: 20,
      height: 40,
      kind: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0.5, y: 1 },
      ],
    });
  });
});
