import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../model/document";
import type { Document } from "../model/document";
import * as sync from "./sync";

function pyramidBlock(doc: Document) {
  const { document, blockId } = sync.addEmptyStructuredBlock(doc, "pyramid");
  return { document: sync.addFirstOutlineNode(document, blockId), blockId };
}

function nodeId(doc: Document, blockId: string, index: number): string {
  const block = doc.structuredBlocks.find((b) => b.id === blockId)!;
  return block.outline[index].id;
}

describe("addEmptyStructuredBlock / addFirstOutlineNode", () => {
  it("creates a block with exactly one root node and one generated shape", () => {
    const { document } = pyramidBlock(createEmptyDocument());
    const block = document.structuredBlocks[0];
    expect(block.outline).toHaveLength(1);
    expect(block.generatedShapeIds).toHaveLength(1);
    expect(Object.keys(document.shapes)).toHaveLength(1);
  });

  it("does nothing if the block already has a root (boundary: not empty anymore)", () => {
    const { document, blockId } = pyramidBlock(createEmptyDocument());
    const again = sync.addFirstOutlineNode(document, blockId);
    expect(again.structuredBlocks[0].outline).toHaveLength(1);
  });
});

describe("addOutlineChild / addOutlineSibling", () => {
  it("adds a child under the given parent and generates one shape for it", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);
    document = sync.addOutlineChild(document, blockId, rootId);

    const block = document.structuredBlocks[0];
    expect(block.outline[0].children).toHaveLength(1);
    expect(block.generatedShapeIds).toHaveLength(2);
  });

  it("adds a sibling after the given node at the same level", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, rootId);

    const block = document.structuredBlocks[0];
    expect(block.outline).toHaveLength(2);
  });

  it("adds a nested sibling under the same parent, not at root level", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);
    document = sync.addOutlineChild(document, blockId, rootId);
    const childId = document.structuredBlocks[0].outline[0].children[0].id;
    document = sync.addOutlineSibling(document, blockId, childId);

    const block = document.structuredBlocks[0];
    expect(block.outline).toHaveLength(1); // still one root
    expect(block.outline[0].children).toHaveLength(2); // two children under it
  });
});

describe("deleteOutlineNode", () => {
  it("removes the node and its whole subtree, plus their shapes", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);
    document = sync.addOutlineChild(document, blockId, rootId);
    const childId = document.structuredBlocks[0].outline[0].children[0].id;
    document = sync.addOutlineChild(document, blockId, childId);
    expect(document.structuredBlocks[0].generatedShapeIds).toHaveLength(3);

    document = sync.deleteOutlineNode(document, blockId, childId);

    const block = document.structuredBlocks[0];
    expect(block.outline[0].children).toHaveLength(0);
    expect(block.generatedShapeIds).toHaveLength(1); // root only; child + grandchild gone
    expect(Object.keys(document.shapes)).toHaveLength(1);
  });
});

describe("updateOutlineNodeText / updateShapeContentAndSync", () => {
  it("outline edit updates the generated shape's content without moving it", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);
    const shapeId = document.structuredBlocks[0].generatedShapeIds[0];
    const before = document.shapes[shapeId];

    document = sync.updateOutlineNodeText(document, blockId, rootId, "こんにちは");

    const after = document.shapes[shapeId];
    expect(after.type === "text" && after.content).toBe("こんにちは");
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });

  it("shape-side content edit updates the outline node's text", () => {
    let { document } = pyramidBlock(createEmptyDocument());
    const shapeId = document.structuredBlocks[0].generatedShapeIds[0];

    document = sync.updateShapeContentAndSync(document, shapeId, "編集後");

    expect(document.structuredBlocks[0].outline[0].text).toBe("編集後");
  });

  it("is a no-op for a shape that isn't part of any structured block", () => {
    const doc = createEmptyDocument();
    const result = sync.updateShapeContentAndSync(doc, "nonexistent", "x");
    expect(result).toEqual(doc);
  });
});

describe("indentOutlineNode / outdentOutlineNode", () => {
  it("indents a root into becoming a child of the previous root", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const firstRootId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, firstRootId);
    const secondRootId = document.structuredBlocks[0].outline[1].id;

    document = sync.indentOutlineNode(document, blockId, secondRootId);

    const block = document.structuredBlocks[0];
    expect(block.outline).toHaveLength(1);
    expect(block.outline[0].children).toHaveLength(1);
    expect(block.outline[0].children[0].id).toBe(secondRootId);
  });

  it("does nothing when indenting the first node at its level (no preceding sibling)", () => {
    const { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);
    const result = sync.indentOutlineNode(document, blockId, rootId);
    expect(result.structuredBlocks[0].outline).toHaveLength(1);
  });

  it("outdent reverses indent: a child becomes a root again, placed after its old parent", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const firstRootId = nodeId(document, blockId, 0);
    document = sync.addOutlineChild(document, blockId, firstRootId);
    const childId = document.structuredBlocks[0].outline[0].children[0].id;

    document = sync.outdentOutlineNode(document, blockId, childId);

    const block = document.structuredBlocks[0];
    expect(block.outline).toHaveLength(2);
    expect(block.outline[0].children).toHaveLength(0);
    expect(block.outline[1].id).toBe(childId);
  });

  it("does nothing when outdenting an already-root node", () => {
    const { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);
    const result = sync.outdentOutlineNode(document, blockId, rootId);
    expect(result.structuredBlocks[0].outline).toHaveLength(1);
  });

  it("relayouts shape positions after a structural change", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const firstRootId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, firstRootId);
    const secondRootId = document.structuredBlocks[0].outline[1].id;
    const secondRootShapeId = document.structuredBlocks[0].generatedShapeIds[1];
    const beforeY = document.shapes[secondRootShapeId].y;

    document = sync.indentOutlineNode(document, blockId, secondRootId);

    // Now a child (row below) instead of a second root (same row) - y must change.
    expect(document.shapes[secondRootShapeId].y).not.toBe(beforeY);
  });
});

describe("moveOutlineNode", () => {
  it("swaps a node with its previous sibling when moving up", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const firstRootId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, firstRootId);
    const secondRootId = document.structuredBlocks[0].outline[1].id;

    document = sync.moveOutlineNode(document, blockId, secondRootId, "up");

    expect(document.structuredBlocks[0].outline[0].id).toBe(secondRootId);
  });

  it("does nothing when moving the first node up or the last node down", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const firstRootId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, firstRootId);

    const afterUp = sync.moveOutlineNode(document, blockId, firstRootId, "up");
    expect(afterUp.structuredBlocks[0].outline[0].id).toBe(firstRootId);

    const secondRootId = document.structuredBlocks[0].outline[1].id;
    const afterDown = sync.moveOutlineNode(document, blockId, secondRootId, "down");
    expect(afterDown.structuredBlocks[0].outline[1].id).toBe(secondRootId);
  });
});

describe("replaceOutline", () => {
  it("discards all previous shapes for the block and generates fresh ones", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const oldShapeId = document.structuredBlocks[0].generatedShapeIds[0];

    const newOutline = [
      { id: "n1", text: "new root", children: [{ id: "n2", text: "new child", children: [] }] },
    ];
    document = sync.replaceOutline(document, blockId, newOutline);

    expect(document.shapes[oldShapeId]).toBeUndefined();
    expect(document.structuredBlocks[0].generatedShapeIds).toHaveLength(2);
    expect(document.structuredBlocks[0].outline).toBe(newOutline);
  });
});

describe("matrix blocks (fully-relayouted pattern)", () => {
  function matrixBlock(doc: Document) {
    const { document, blockId } = sync.addEmptyStructuredBlock(doc, "matrix");
    return { document: sync.addFirstOutlineNode(document, blockId), blockId };
  }

  it("regenerates all shapes (not incremental placement) when a quadrant item is added", () => {
    let { document, blockId } = matrixBlock(createEmptyDocument());
    const q1Id = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, q1Id); // 2nd quadrant
    document = sync.addOutlineChild(document, blockId, q1Id); // item under q1

    const block = document.structuredBlocks[0];
    expect(block.outline).toHaveLength(2);
    expect(block.outline[0].children).toHaveLength(1);
    // 2 quadrants x (background square + title label) + 1 item shape
    expect(block.generatedShapeIds).toHaveLength(5);
  });

  it("a 5th root is kept in the outline but never gets a shape", () => {
    let { document, blockId } = matrixBlock(createEmptyDocument());
    let lastId = nodeId(document, blockId, 0);
    for (let i = 0; i < 4; i++) {
      document = sync.addOutlineSibling(document, blockId, lastId);
      const block = document.structuredBlocks[0];
      lastId = block.outline[block.outline.length - 1].id;
    }
    const block = document.structuredBlocks[0];
    expect(block.outline).toHaveLength(5);
    // 4 quadrants x (background square + title label), the 5th gets neither.
    expect(block.generatedShapeIds).toHaveLength(8);
  });

  it("updateMatrixAxisLabels adds/updates/removes axis label shapes", () => {
    const { document, blockId } = matrixBlock(createEmptyDocument());
    const withLabels = sync.updateMatrixAxisLabels(document, blockId, { axisXLabel: "X軸", axisYLabel: "Y軸" });
    const block1 = withLabels.structuredBlocks[0];
    const axisShapeIds1 = block1.params._axisShapeIds as string[];
    expect(axisShapeIds1).toHaveLength(2);
    expect(block1.generatedShapeIds).toEqual(expect.arrayContaining(axisShapeIds1));

    const cleared = sync.updateMatrixAxisLabels(withLabels, blockId, { axisXLabel: "", axisYLabel: "" });
    const block2 = cleared.structuredBlocks[0];
    expect((block2.params._axisShapeIds as string[]).length).toBe(0);
    for (const id of axisShapeIds1) expect(cleared.shapes[id]).toBeUndefined();
  });

  // Reproduces the same off-canvas bug as venn's circles: layoutMatrixAxisLabels
  // places labels at negative offsets from the grid (outside it, to its
  // left/above), so a freshly-placed block (default origin (40, 40)) put the
  // Y-axis label's absolute x at 40 - 176 = -136 - off-canvas even though
  // nothing appeared to be wrong with the grid itself.
  it("never places an axis label shape at a negative coordinate", () => {
    const { document, blockId } = matrixBlock(createEmptyDocument());
    const withLabels = sync.updateMatrixAxisLabels(document, blockId, { axisXLabel: "X軸", axisYLabel: "Y軸" });
    const block = withLabels.structuredBlocks[0];
    const axisShapeIds = block.params._axisShapeIds as string[];
    expect(axisShapeIds.length).toBeGreaterThan(0);
    for (const id of axisShapeIds) {
      expect(withLabels.shapes[id].x).toBeGreaterThanOrEqual(0);
      expect(withLabels.shapes[id].y).toBeGreaterThanOrEqual(0);
    }
  });

  // Reproduces the reported follow-up bug: clamping the label's own absolute
  // position to >= 0 stopped it going off-canvas, but for a block placed near
  // the canvas edge (default origin (40, 40), well inside the Y-axis label's
  // own 176px reach) that clamp pulled the label so far right that it landed
  // on top of the grid instead of to its left. The fix must shift the whole
  // block to make room instead, so the label stays outside the grid.
  it("shifts the whole block to keep the Y-axis label outside the grid (not overlapping it)", () => {
    const { document, blockId } = matrixBlock(createEmptyDocument());
    const withLabels = sync.updateMatrixAxisLabels(document, blockId, { axisYLabel: "Y軸" });
    const block = withLabels.structuredBlocks[0];
    const axisShapeId = (block.params._axisShapeIds as string[])[0];
    const axisShape = withLabels.shapes[axisShapeId];

    const gridLeftX = Math.min(
      ...block.generatedShapeIds.filter((id) => id !== axisShapeId).map((id) => withLabels.shapes[id].x),
    );
    expect(axisShape.x + axisShape.width).toBeLessThanOrEqual(gridLeftX);
  });

  // Axis label shapes must not pollute originOfBlock: since they're allowed to
  // sit "outside" the grid, if they counted toward the block's origin, every
  // later regeneration (e.g. adding a quadrant item) would inherit their
  // position and drift the whole grid instead of staying anchored in place.
  it("adding a quadrant item after setting axis labels does not move the grid's origin", () => {
    let { document, blockId } = matrixBlock(createEmptyDocument());
    const q1Id = nodeId(document, blockId, 0);
    document = sync.updateMatrixAxisLabels(document, blockId, { axisXLabel: "X軸", axisYLabel: "Y軸" });
    const q1ShapeIdBefore = document.structuredBlocks[0].generatedShapeIds.find(
      (id) => document.shapes[id].templateNodeIds?.includes(q1Id),
    )!;
    const q1Before = document.shapes[q1ShapeIdBefore];

    document = sync.addOutlineChild(document, blockId, q1Id);
    const q1ShapeIdAfter = document.structuredBlocks[0].generatedShapeIds.find(
      (id) => document.shapes[id].templateNodeIds?.includes(q1Id),
    )!;
    const q1After = document.shapes[q1ShapeIdAfter];

    expect(q1After.x).toBe(q1Before.x);
    expect(q1After.y).toBe(q1Before.y);
  });
});

describe("venn blocks (fully-relayouted, text-dependent pattern)", () => {
  function vennBlock(doc: Document) {
    const { document, blockId } = sync.addEmptyStructuredBlock(doc, "venn");
    return { document: sync.addFirstOutlineNode(document, blockId), blockId };
  }

  it("regenerates shapes when an element's text edit changes its set combination", () => {
    let { document, blockId } = vennBlock(createEmptyDocument());
    const setAId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, setAId); // set B
    const setBId = document.structuredBlocks[0].outline[1].id;

    document = sync.addOutlineChild(document, blockId, setAId); // element under A
    const elementId = document.structuredBlocks[0].outline[0].children[0].id;
    document = sync.updateOutlineNodeText(document, blockId, elementId, "みかん");
    document = sync.addOutlineChild(document, blockId, setBId); // element under B
    const elementBId = document.structuredBlocks[0].outline[1].children[0].id;
    document = sync.updateOutlineNodeText(document, blockId, elementBId, "みかん");

    // Now shared: one shape backed by both nodeIds.
    let shared = Object.values(document.shapes).find((s) => s.templateNodeIds?.includes(elementId))!;
    expect(shared.templateNodeIds?.sort()).toEqual([elementBId, elementId].sort());

    // Editing one side's text so they no longer match should split them apart
    // again into two separate shapes.
    document = sync.updateOutlineNodeText(document, blockId, elementId, "りんご");
    const stillMerged = Object.values(document.shapes).find(
      (s) => s.templateNodeIds?.includes(elementId) && s.templateNodeIds.includes(elementBId),
    );
    expect(stillMerged).toBeUndefined();
    const applesShape = Object.values(document.shapes).find((s) => s.templateNodeIds?.includes(elementId))!;
    expect(applesShape.templateNodeIds).toEqual([elementId]);
  });

  it("updateVennSetCount shrinks the outline and regenerates shapes accordingly", () => {
    let { document, blockId } = vennBlock(createEmptyDocument());
    const setAId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, setAId);
    document = sync.updateVennSetCount(document, blockId, 3);
    document = sync.addOutlineSibling(document, blockId, document.structuredBlocks[0].outline[1].id);
    expect(document.structuredBlocks[0].outline).toHaveLength(3);

    document = sync.updateVennSetCount(document, blockId, 2);
    const block = document.structuredBlocks[0];
    expect(block.outline).toHaveLength(2);
    expect(block.params.setCount).toBe(2);
  });

  // Reproduces the reported bug: venn.ts's circle layout is centered on
  // (0, 0) and spans negative coordinates, but every shape position is
  // computed as `blockOrigin + layoutNode offset` - a negative offset placed
  // the whole diagram off-canvas (above/left of the visible area), so
  // nothing appeared even though the shapes existed in the document.
  it("never places a generated shape at a negative coordinate (2 or 3 sets)", () => {
    for (const setCount of [2, 3] as const) {
      let { document, blockId } = vennBlock(createEmptyDocument());
      if (setCount === 3) document = sync.updateVennSetCount(document, blockId, 3);
      const setAId = nodeId(document, blockId, 0);
      document = sync.addOutlineSibling(document, blockId, setAId);
      if (setCount === 3) document = sync.addOutlineSibling(document, blockId, document.structuredBlocks[0].outline[1].id);
      document = sync.addOutlineChild(document, blockId, setAId);

      const block = document.structuredBlocks[0];
      expect(block.generatedShapeIds.length).toBeGreaterThan(0);
      for (const shapeId of block.generatedShapeIds) {
        const shape = document.shapes[shapeId];
        expect(shape.x).toBeGreaterThanOrEqual(0);
        expect(shape.y).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("pyramid incremental placement (reproducing the reported bug)", () => {
  it("places a child below its root (greater y, same-ish x) via addOutlineChild", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);
    const rootShapeBefore = document.structuredBlocks[0].generatedShapeIds
      .map((id) => document.shapes[id])
      .find((s) => s.templateNodeIds?.includes(rootId))!;

    document = sync.addOutlineChild(document, blockId, rootId);
    const childId = document.structuredBlocks[0].outline[0].children[0].id;
    const childShape = Object.values(document.shapes).find((s) => s.templateNodeIds?.includes(childId))!;

    expect(childShape.y).toBeGreaterThan(rootShapeBefore.y);
  });

  it("places two children of the same root on the same row (equal y), spread horizontally", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);

    document = sync.addOutlineChild(document, blockId, rootId);
    const firstChildId = document.structuredBlocks[0].outline[0].children[0].id;
    document = sync.addOutlineSibling(document, blockId, firstChildId);
    const secondChildId = document.structuredBlocks[0].outline[0].children[1].id;

    const firstShape = Object.values(document.shapes).find((s) => s.templateNodeIds?.includes(firstChildId))!;
    const secondShape = Object.values(document.shapes).find((s) => s.templateNodeIds?.includes(secondChildId))!;

    expect(firstShape.y).toBe(secondShape.y);
    expect(firstShape.x).not.toBe(secondShape.x);
  });

  it("keeps a 3-level chain (root -> child -> grandchild) strictly increasing in y", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);
    document = sync.addOutlineChild(document, blockId, rootId);
    const childId = document.structuredBlocks[0].outline[0].children[0].id;
    document = sync.addOutlineChild(document, blockId, childId);
    const grandchildId = document.structuredBlocks[0].outline[0].children[0].children[0].id;

    const shapesByNode = (id: string) => Object.values(document.shapes).find((s) => s.templateNodeIds?.includes(id))!;
    const rootY = shapesByNode(rootId).y;
    const childY = shapesByNode(childId).y;
    const grandchildY = shapesByNode(grandchildId).y;

    expect(childY).toBeGreaterThan(rootY);
    expect(grandchildY).toBeGreaterThan(childY);
  });

  it("indenting a root into a child moves it strictly below its new parent, same x-ish column", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const firstRootId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, firstRootId);
    const secondRootId = document.structuredBlocks[0].outline[1].id;

    const shapeFor = (doc: typeof document, nid: string) =>
      Object.values(doc.shapes).find((s) => s.templateNodeIds?.includes(nid))!;
    const firstRootYBefore = shapeFor(document, firstRootId).y;

    document = sync.indentOutlineNode(document, blockId, secondRootId);

    const firstRootAfter = shapeFor(document, firstRootId);
    const secondAsChildAfter = shapeFor(document, secondRootId);

    // The (former) first root is now the sole parent, so its position should
    // be unaffected by the relayout...
    expect(firstRootAfter.y).toBe(firstRootYBefore);
    // ...and the indented node must now be BELOW it (a child row), not still
    // on the same row (which is what "text appears horizontal instead of
    // vertical" would look like).
    expect(secondAsChildAfter.y).toBeGreaterThan(firstRootAfter.y);
  });

  it("reproduces: two extra root-level siblings, then indent both under the first root", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, rootId);
    const secondId = document.structuredBlocks[0].outline[1].id;
    document = sync.addOutlineSibling(document, blockId, secondId);
    const thirdId = document.structuredBlocks[0].outline[2].id;

    document = sync.indentOutlineNode(document, blockId, secondId);
    // After indenting `second` under `root`, `third` (still a root-level
    // sibling in the outline) is no longer adjacent to `second` - indent
    // again targets whatever is now the immediately preceding sibling.
    document = sync.indentOutlineNode(document, blockId, thirdId);

    const shapeFor = (nid: string) => Object.values(document.shapes).find((s) => s.templateNodeIds?.includes(nid))!;
    const root = shapeFor(rootId);
    const second = shapeFor(secondId);
    const third = shapeFor(thirdId);

    expect(document.structuredBlocks[0].outline).toHaveLength(1); // only `root` remains at the top level
    expect(second.y).toBeGreaterThan(root.y);
    expect(third.y).toBeGreaterThan(root.y);
    // The two children should end up on the same row as each other, not
    // stacked on top of one another or left on the root's row.
    expect(second.y).toBe(third.y);
  });
});
