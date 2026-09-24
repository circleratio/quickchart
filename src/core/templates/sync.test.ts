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
  it("adds a child under the given parent and generates one shape for it, plus a connector line", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);
    document = sync.addOutlineChild(document, blockId, rootId);

    const block = document.structuredBlocks[0];
    expect(block.outline[0].children).toHaveLength(1);
    const shapes = block.generatedShapeIds.map((id) => document.shapes[id]);
    expect(shapes.filter((s) => s.type === "text")).toHaveLength(2); // root + child
    // Single child: a stub down from the parent plus one into the child - no
    // horizontal bus segment needed (see "tree connector lines" below).
    expect(shapes.filter((s) => s.type === "line")).toHaveLength(2);
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
  it("removes the node and its whole subtree, plus their shapes and connectors", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);
    document = sync.addOutlineChild(document, blockId, rootId);
    const childId = document.structuredBlocks[0].outline[0].children[0].id;
    document = sync.addOutlineChild(document, blockId, childId);
    // 3 node shapes (root/child/grandchild) + 2 connectors (root->child,
    // child->grandchild), 2 line segments each (single child each level).
    expect(document.structuredBlocks[0].generatedShapeIds).toHaveLength(7);

    document = sync.deleteOutlineNode(document, blockId, childId);

    const block = document.structuredBlocks[0];
    expect(block.outline[0].children).toHaveLength(0);
    expect(block.generatedShapeIds).toHaveLength(1); // root only; child/grandchild and their connectors gone
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
    // 2 node shapes (new root + new child) + 2 connector line segments
    // (single child - see "tree connector lines" below).
    expect(document.structuredBlocks[0].generatedShapeIds).toHaveLength(4);
    expect(document.structuredBlocks[0].outline).toBe(newOutline);
  });
});

describe("matrix blocks (fully-relayouted pattern)", () => {
  function matrixBlock(doc: Document) {
    const { document, blockId } = sync.addEmptyStructuredBlock(doc, "matrix");
    return { document: sync.addFirstOutlineNode(document, blockId), blockId };
  }
  const shapesOf = (doc: Document) => doc.structuredBlocks[0].generatedShapeIds.map((id) => doc.shapes[id]);
  const shapeForNode = (doc: Document, id: string, type: string) =>
    shapesOf(doc).find((s) => s.type === type && s.templateNodeIds?.includes(id))!;

  it("starts with all 4 empty quadrants and the axis cross", () => {
    const { document } = matrixBlock(createEmptyDocument());
    expect(document.structuredBlocks[0].outline).toHaveLength(4);
    // 4 x (quadrant box + badge), plus 2 cross arrows
    expect(shapesOf(document).filter((s) => s.type === "rect")).toHaveLength(8);
    expect(shapesOf(document).filter((s) => s.type === "polygon")).toHaveLength(2);
  });

  it("draws the quadrant boxes unfilled", () => {
    const { document } = matrixBlock(createEmptyDocument());
    const q1 = document.structuredBlocks[0].outline[0].id;
    const box = shapesOf(document).find((s) => s.type === "rect" && s.templateNodeIds?.includes(q1) && s.width > 300)!;
    expect(box.style.fill).toBe("none");
  });

  it("adding a bullet regenerates the block without moving the grid", () => {
    let { document, blockId } = matrixBlock(createEmptyDocument());
    const q1 = nodeId(document, blockId, 0);
    const before = shapeForNode(document, q1, "rect");

    document = sync.addOutlineChild(document, blockId, q1);

    const after = shapeForNode(document, q1, "rect");
    expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y });
    const bulletId = document.structuredBlocks[0].outline[0].children[0].id;
    const bullet = shapeForNode(document, bulletId, "text");
    expect(bullet.type === "text" && bullet.bulletMarker).toBe("□ ");
  });

  it("updateBlockParams draws a matrix's title and axis-end labels, and removes them when cleared", () => {
    const { document, blockId } = matrixBlock(createEmptyDocument());
    const texts = (doc: Document) => shapesOf(doc).flatMap((s) => (s.type === "text" && s.content ? [s.content] : []));

    const labeled = sync.updateBlockParams(document, blockId, {
      title: "人材活用のための分類",
      axisTop: "創造",
      axisBottom: "運用",
      axisLeft: "個人",
      axisRight: "組織",
    });
    expect(texts(labeled)).toEqual(expect.arrayContaining(["人材活用のための分類", "創造", "運用", "個人", "組織"]));
    for (const s of shapesOf(labeled)) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeGreaterThanOrEqual(0);
    }

    const cleared = sync.updateBlockParams(labeled, blockId, { title: "", axisTop: "", axisBottom: "", axisLeft: "", axisRight: "" });
    expect(texts(cleared)).toEqual([]);
  });

  it("a text edit after setting labels keeps every shape in place", () => {
    let { document, blockId } = matrixBlock(createEmptyDocument());
    document = sync.updateBlockParams(document, blockId, { axisLeft: "個人", axisTop: "創造" });
    const before = shapesOf(document).map((s) => ({ x: s.x, y: s.y }));
    document = sync.updateOutlineNodeText(document, blockId, nodeId(document, blockId, 0), "クリエイティブ人材");
    expect(shapesOf(document).map((s) => ({ x: s.x, y: s.y }))).toEqual(before);
  });

  // Blocks saved before the redesign kept axisXLabel/axisYLabel and tracked
  // their separately-placed label shapes in params._axisShapeIds.
  it("migrates a pre-redesign block's axis names to the right/top ends", () => {
    let { document, blockId } = matrixBlock(createEmptyDocument());
    document = {
      ...document,
      structuredBlocks: document.structuredBlocks.map((b) => ({ ...b, params: { axisXLabel: "市場シェア", axisYLabel: "市場成長性", _axisShapeIds: [] } })),
    };
    document = sync.updateBlockParams(document, blockId, { title: "PPM" });
    const params = document.structuredBlocks[0].params;
    expect(params.axisRight).toBe("市場シェア");
    expect(params.axisTop).toBe("市場成長性");
    expect(params.axisXLabel).toBeUndefined();
    expect(params._axisShapeIds).toBeUndefined();
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

  it("updateBlockParams with a smaller setCount shrinks the outline and regenerates shapes accordingly", () => {
    let { document, blockId } = vennBlock(createEmptyDocument());
    const setAId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, setAId);
    document = sync.updateBlockParams(document, blockId, { setCount: 3 });
    document = sync.addOutlineSibling(document, blockId, document.structuredBlocks[0].outline[1].id);
    expect(document.structuredBlocks[0].outline).toHaveLength(3);

    document = sync.updateBlockParams(document, blockId, { setCount: 2 });
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
      if (setCount === 3) document = sync.updateBlockParams(document, blockId, { setCount: 3 });
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

describe("headingBullets blocks (fully-relayouted pattern)", () => {
  function headingBulletsBlock(doc: Document) {
    const { document, blockId } = sync.addEmptyStructuredBlock(doc, "headingBullets");
    return { document: sync.addFirstOutlineNode(document, blockId), blockId };
  }

  it("generates a heading shape and a bullet shape per item, regenerating all shapes on a structural edit", () => {
    let { document, blockId } = headingBulletsBlock(createEmptyDocument());
    const rowId = nodeId(document, blockId, 0);
    document = sync.addOutlineChild(document, blockId, rowId); // 1st bullet
    document = sync.addOutlineChild(document, blockId, rowId); // 2nd bullet

    const block = document.structuredBlocks[0];
    expect(block.outline[0].children).toHaveLength(2);
    // 1 heading shape + 2 bullet shapes.
    expect(block.generatedShapeIds).toHaveLength(3);

    const heading = block.generatedShapeIds.map((id) => document.shapes[id]).find((s) => s.templateNodeIds?.includes(rowId))!;
    expect(heading.style.fill).not.toBe("none"); // solid-filled, unlike a bullet
    const bullets = block.generatedShapeIds
      .map((id) => document.shapes[id])
      .filter((s) => s.type === "text" && s.bulletMarker);
    expect(bullets).toHaveLength(2);
    for (const b of bullets) expect(b.style.fill).toBe("none"); // borderless
  });

  it("stacks a 2nd row below the 1st and adds a dashed separator between them", () => {
    let { document, blockId } = headingBulletsBlock(createEmptyDocument());
    const row1Id = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, row1Id); // 2nd row

    const block = document.structuredBlocks[0];
    const shapes = block.generatedShapeIds.map((id) => document.shapes[id]);
    const row1 = shapes.find((s) => s.templateNodeIds?.includes(row1Id))!;
    const row2Id = block.outline[1].id;
    const row2 = shapes.find((s) => s.templateNodeIds?.includes(row2Id))!;
    expect(row2.y).toBeGreaterThanOrEqual(row1.y + row1.height);

    const separators = shapes.filter((s) => s.type === "line");
    expect(separators).toHaveLength(1);
  });

  it("editing a bullet's text patches its shape's content in place without moving any shape", () => {
    let { document, blockId } = headingBulletsBlock(createEmptyDocument());
    const rowId = nodeId(document, blockId, 0);
    document = sync.addOutlineChild(document, blockId, rowId);
    const itemId = document.structuredBlocks[0].outline[0].children[0].id;

    const before = document.structuredBlocks[0].generatedShapeIds.map((id) => ({ ...document.shapes[id] }));
    document = sync.updateOutlineNodeText(document, blockId, itemId, "新しい項目テキスト");
    const after = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);

    expect(after.map((s) => ({ x: s.x, y: s.y, width: s.width, height: s.height }))).toEqual(
      before.map((s) => ({ x: s.x, y: s.y, width: s.width, height: s.height })),
    );
    const editedShape = after.find((s) => s.templateNodeIds?.includes(itemId))!;
    expect(editedShape.type === "text" && editedShape.content).toBe("新しい項目テキスト");
  });
});

describe("bulletMatrix blocks (fully-relayouted pattern)", () => {
  function bulletMatrixBlock(doc: Document, columnHeaders: string[]) {
    const { document, blockId } = sync.addEmptyStructuredBlock(doc, "bulletMatrix");
    const withColumns = sync.updateBlockParams(document, blockId, { columnHeaders });
    return { document: sync.addFirstOutlineNode(withColumns, blockId), blockId };
  }

  it("fills a newly-added row with one empty cell per configured column", () => {
    const { document, blockId } = bulletMatrixBlock(createEmptyDocument(), ["企業", "産業"]);
    const block = document.structuredBlocks.find((b) => b.id === blockId)!;
    expect(block.outline[0].children).toHaveLength(2);
    expect(block.outline[0].children.every((c) => c.children.length === 0)).toBe(true);
  });

  it("fills a 2nd row (added at root level) with cells too, not just the first", () => {
    let { document, blockId } = bulletMatrixBlock(createEmptyDocument(), ["企業", "産業"]);
    const row1Id = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, row1Id);
    const block = document.structuredBlocks[0];
    expect(block.outline[1].children).toHaveLength(2);
  });

  it("adding a child to a cell adds a title under it, not another cell", () => {
    let { document, blockId } = bulletMatrixBlock(createEmptyDocument(), ["企業"]);
    const cellId = document.structuredBlocks[0].outline[0].children[0].id;
    document = sync.addOutlineChild(document, blockId, cellId);
    const cell = document.structuredBlocks[0].outline[0].children[0];
    expect(cell.children).toHaveLength(1);
  });

  it("growing columns keeps existing cells' content, padding new columns with empty cells", () => {
    let { document, blockId } = bulletMatrixBlock(createEmptyDocument(), ["企業"]);
    const cellId = document.structuredBlocks[0].outline[0].children[0].id;
    document = sync.addOutlineChild(document, blockId, cellId); // a title in column 0
    const titleId = document.structuredBlocks[0].outline[0].children[0].children[0].id;

    document = sync.updateBlockParams(document, blockId, { columnHeaders: ["企業", "産業"] });
    const row = document.structuredBlocks[0].outline[0];
    expect(row.children).toHaveLength(2);
    expect(row.children[0].children[0].id).toBe(titleId); // column 0's content survived
    expect(row.children[1].children).toHaveLength(0); // new column starts empty
  });

  it("shrinking columns discards the dropped column's shapes", () => {
    let { document, blockId } = bulletMatrixBlock(createEmptyDocument(), ["企業", "産業"]);
    const col1CellId = document.structuredBlocks[0].outline[0].children[1].id;
    document = sync.addOutlineChild(document, blockId, col1CellId);
    const titleId = document.structuredBlocks[0].outline[0].children[1].children[0].id;
    expect(Object.values(document.shapes).some((s) => s.templateNodeIds?.includes(titleId))).toBe(true);

    document = sync.updateBlockParams(document, blockId, { columnHeaders: ["企業"] });
    expect(document.structuredBlocks[0].outline[0].children).toHaveLength(1);
    expect(Object.values(document.shapes).some((s) => s.templateNodeIds?.includes(titleId))).toBe(false);
  });

  it("replaceOutline with columnHeaders sets columns and outline together, generating correctly-styled row/column headers and title/detail shapes", () => {
    const cell: Document["structuredBlocks"][0]["outline"][0] = {
      id: "cell-a1",
      text: "",
      children: [{ id: "title-1", text: "見出し", children: [{ id: "detail-1", text: "詳細", children: [] }] }],
    };
    const outline = [{ id: "row-1", text: "行1", children: [cell] }];

    const { document: base, blockId } = sync.addEmptyStructuredBlock(createEmptyDocument(), "bulletMatrix");
    const document = sync.replaceOutline(base, blockId, outline, { columnHeaders: ["列1"] });

    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    const rowHeader = shapes.find((s) => s.templateNodeIds?.includes("row-1"))!;
    const columnHeader = shapes.find((s) => s.type === "text" && s.content === "列1")!;
    const title = shapes.find((s) => s.templateNodeIds?.includes("title-1"))!;
    const detail = shapes.find((s) => s.templateNodeIds?.includes("detail-1"))!;

    expect(rowHeader.style.fill).not.toBe(columnHeader.style.fill); // visually distinct roles
    expect(title.type === "text" && title.bulletMarker).toBe("• ");
    expect(title.style.fontWeight).toBe("bold");
    expect(title.style.textDecoration).toBe("underline");
    expect(detail.type === "text" && detail.bulletMarker).toBe("- ");
    expect(detail.style.fontWeight).not.toBe("bold");
  });

  it("editing a title's text patches its shape's content in place without moving any shape", () => {
    let { document, blockId } = bulletMatrixBlock(createEmptyDocument(), ["企業"]);
    const cellId = document.structuredBlocks[0].outline[0].children[0].id;
    document = sync.addOutlineChild(document, blockId, cellId);
    const titleId = document.structuredBlocks[0].outline[0].children[0].children[0].id;

    const before = document.structuredBlocks[0].generatedShapeIds.map((id) => ({ ...document.shapes[id] }));
    document = sync.updateOutlineNodeText(document, blockId, titleId, "新しいタイトル");
    const after = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);

    expect(after.map((s) => ({ x: s.x, y: s.y }))).toEqual(before.map((s) => ({ x: s.x, y: s.y })));
    const edited = after.find((s) => s.templateNodeIds?.includes(titleId))!;
    expect(edited.type === "text" && edited.content).toBe("新しいタイトル");
  });
});

describe("pyramidChart blocks (fully-relayouted pattern)", () => {
  function pyramidChartBlock(doc: Document, columnHeaders: string[]) {
    const { document, blockId } = sync.addEmptyStructuredBlock(doc, "pyramidChart");
    const withColumns = sync.updateBlockParams(document, blockId, { columnHeaders });
    return { document: sync.addFirstOutlineNode(withColumns, blockId), blockId };
  }

  it("fills a newly-added level with a scale slot plus one cell per configured column", () => {
    const { document, blockId } = pyramidChartBlock(createEmptyDocument(), ["定義", "区分1"]);
    const block = document.structuredBlocks.find((b) => b.id === blockId)!;
    expect(block.outline[0].children).toHaveLength(3); // scale + 2 cells
  });

  it("generates one polygon band per level, tapering by index - apex (level 0) narrower than the base", () => {
    let { document, blockId } = pyramidChartBlock(createEmptyDocument(), ["定義"]);
    const level1Id = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, level1Id);

    const block = document.structuredBlocks[0];
    const shapes = block.generatedShapeIds.map((id) => document.shapes[id]);
    const band1 = shapes.find((s) => s.type === "polygon" && s.templateNodeIds?.includes(level1Id))!;
    const level2Id = block.outline[1].id;
    const band2 = shapes.find((s) => s.type === "polygon" && s.templateNodeIds?.includes(level2Id))!;
    expect(band1.style.fill).not.toBe(band2.style.fill); // apex is darker than the level below it
    expect(band2.y).toBeGreaterThanOrEqual(band1.y + band1.height);
  });

  it("uses white text for the item-name/scale labels over the dark apex band, and dark text once the bands get light enough", () => {
    let { document, blockId } = pyramidChartBlock(createEmptyDocument(), ["定義"]);
    // 5 levels: the apex (index 0, darkest) and the last (index 4, lightest of
    // the theme's 5 shades) sit at opposite ends of style.ts's contrast check.
    for (let i = 1; i < 5; i++) {
      const lastId = document.structuredBlocks[0].outline[i - 1].id;
      document = sync.addOutlineSibling(document, blockId, lastId);
    }

    const block = document.structuredBlocks[0];
    const shapes = block.generatedShapeIds.map((id) => document.shapes[id]);
    const apexId = block.outline[0].id;
    const baseId = block.outline[4].id;
    // The item-name label is the only "text" shape tied to the level's own
    // (row) nodeId - its scale/cell children have their own, separate ids.
    const apexLabel = shapes.find((s) => s.type === "text" && s.templateNodeIds?.includes(apexId));
    const baseLabel = shapes.find((s) => s.type === "text" && s.templateNodeIds?.includes(baseId));

    expect(apexLabel!.style.textColor).toBe("#ffffff"); // neutral-blue's textLight
    expect(baseLabel!.style.textColor).toBe("#1f2933"); // neutral-blue's textDark
  });

  it("reordering levels (move up/down) regenerates every band's taper for its new index, not just its position", () => {
    let { document, blockId } = pyramidChartBlock(createEmptyDocument(), ["定義"]);
    const level1Id = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, level1Id); // level 2
    const level2Id = document.structuredBlocks[0].outline[1].id;

    // Before the swap: level 1 is the apex (a true triangle - both top
    // vertices coincide), level 2 is not.
    function bandFor(doc: Document, targetNodeId: string) {
      const shape = doc.structuredBlocks[0].generatedShapeIds
        .map((id) => doc.shapes[id])
        .find((s) => s.type === "polygon" && s.templateNodeIds?.includes(targetNodeId));
      if (!shape || shape.type !== "polygon") throw new Error("band not found");
      return shape;
    }

    const apexBefore = bandFor(document, level1Id);
    expect(apexBefore.points[0].x).toBeCloseTo(apexBefore.points[1].x);

    document = sync.moveOutlineNode(document, blockId, level2Id, "up");

    // level 2 is now the apex (index 0) and must have been re-tapered to a
    // triangle, not just moved to index 0's y position with its old
    // (non-apex) trapezoid shape still baked in.
    const apexAfter = bandFor(document, level2Id);
    expect(apexAfter.points[0].x).toBeCloseTo(apexAfter.points[1].x);
    const baseAfter = bandFor(document, level1Id);
    expect(baseAfter.points[0].x).not.toBeCloseTo(baseAfter.points[1].x);
  });

  it("growing columns keeps existing cells' content and the scale slot, padding new columns with empty cells", () => {
    let { document, blockId } = pyramidChartBlock(createEmptyDocument(), ["定義"]);
    const scaleId = document.structuredBlocks[0].outline[0].children[0].id;
    const cellId = document.structuredBlocks[0].outline[0].children[1].id;

    document = sync.updateBlockParams(document, blockId, { columnHeaders: ["定義", "区分1"] });
    const row = document.structuredBlocks[0].outline[0];
    expect(row.children).toHaveLength(3);
    expect(row.children[0].id).toBe(scaleId); // scale slot survived
    expect(row.children[1].id).toBe(cellId); // column 0's content survived
    expect(row.children[2].text).toBe(""); // new column starts empty
  });

  it("updateBlockParams({ title }) on a pyramidChart regenerates a title label shape with the new text", () => {
    let { document, blockId } = pyramidChartBlock(createEmptyDocument(), ["定義"]);
    document = sync.updateBlockParams(document, blockId, { title: "市場規模ピラミッド" });
    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    const title = shapes.find((s) => s.type === "text" && s.content === "市場規模ピラミッド");
    expect(title).toBeDefined();
  });

  it("updateBlockParams({ title }) leaves the outline as-is, even rows not matching the columns", () => {
    let { document, blockId } = pyramidChartBlock(createEmptyDocument(), ["定義"]);
    document = sync.replaceOutline(document, blockId, [{ id: "row", text: "層", children: [] }]);
    document = sync.updateBlockParams(document, blockId, { title: "T" });
    expect(document.structuredBlocks[0].outline).toEqual([{ id: "row", text: "層", children: [] }]);
    expect(document.structuredBlocks[0].params).toMatchObject({ columnHeaders: ["定義"], title: "T" });
  });

  it("editing a cell's text patches its shape's content in place without moving any shape", () => {
    let { document, blockId } = pyramidChartBlock(createEmptyDocument(), ["定義"]);
    const cellId = document.structuredBlocks[0].outline[0].children[1].id;

    const before = document.structuredBlocks[0].generatedShapeIds.map((id) => ({ ...document.shapes[id] }));
    document = sync.updateOutlineNodeText(document, blockId, cellId, "新しい定義");
    const after = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);

    expect(after.map((s) => ({ x: s.x, y: s.y }))).toEqual(before.map((s) => ({ x: s.x, y: s.y })));
    const edited = after.find((s) => s.templateNodeIds?.includes(cellId))!;
    expect(edited.type === "text" && edited.content).toBe("新しい定義");
  });
});

describe("flowSchedule blocks (fully-relayouted pattern)", () => {
  function flowScheduleBlock(doc: Document) {
    const { document, blockId } = sync.addEmptyStructuredBlock(doc, "flowSchedule");
    return { document: sync.addFirstOutlineNode(document, blockId), blockId };
  }

  it("generates one heading shape per row, numbered '01 | ' via bulletMarker rather than baked into content", () => {
    const { document, blockId } = flowScheduleBlock(createEmptyDocument());
    const rowId = nodeId(document, blockId, 0);
    const heading = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]).find((s) => s.templateNodeIds?.includes(rowId))!;
    expect(heading.type === "text" && heading.content).toBe("");
    expect(heading.type === "text" && heading.bulletMarker).toBe("01 | ");
  });

  it("updateBlockParams({ title }) on a flowSchedule regenerates a title label shape with the new text", () => {
    const { document, blockId } = flowScheduleBlock(createEmptyDocument());
    const next = sync.updateBlockParams(document, blockId, { title: "フロースケジュール（縦）" });
    const shapes = next.structuredBlocks[0].generatedShapeIds.map((id) => next.shapes[id]);
    const title = shapes.find((s) => s.type === "text" && s.content === "フロースケジュール（縦）");
    expect(title).toBeDefined();
  });

  it("editing a row's text patches its shape's content in place without moving it or touching its number", () => {
    const { document, blockId } = flowScheduleBlock(createEmptyDocument());
    const rowId = nodeId(document, blockId, 0);

    const before = document.structuredBlocks[0].generatedShapeIds.map((id) => ({ ...document.shapes[id] }));
    const after = sync.updateOutlineNodeText(document, blockId, rowId, "お問い合わせ");
    const afterShapes = after.structuredBlocks[0].generatedShapeIds.map((id) => after.shapes[id]);

    expect(afterShapes.map((s) => ({ x: s.x, y: s.y }))).toEqual(before.map((s) => ({ x: s.x, y: s.y })));
    const edited = afterShapes.find((s) => s.templateNodeIds?.includes(rowId))!;
    expect(edited.type === "text" && edited.content).toBe("お問い合わせ");
    expect(edited.type === "text" && edited.bulletMarker).toBe("01 | ");
  });

  it("reordering rows (move up/down) regenerates each heading's number for its new index", () => {
    let { document, blockId } = flowScheduleBlock(createEmptyDocument());
    document = sync.updateOutlineNodeText(document, blockId, nodeId(document, blockId, 0), "お問い合わせ");
    const firstId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, firstId);
    document = sync.updateOutlineNodeText(document, blockId, document.structuredBlocks[0].outline[1].id, "ヒアリング");
    const secondId = document.structuredBlocks[0].outline[1].id;

    document = sync.moveOutlineNode(document, blockId, secondId, "up");

    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    const movedHeading = shapes.find((s) => s.templateNodeIds?.includes(secondId))!;
    const pushedHeading = shapes.find((s) => s.templateNodeIds?.includes(firstId))!;
    expect(movedHeading.type === "text" && movedHeading.content).toBe("ヒアリング");
    expect(movedHeading.type === "text" && movedHeading.bulletMarker).toBe("01 | ");
    expect(pushedHeading.type === "text" && pushedHeading.bulletMarker).toBe("02 | ");
  });
});

describe("flowScheduleHorizontal blocks (fully-relayouted pattern)", () => {
  function flowScheduleHorizontalBlock(doc: Document) {
    const { document, blockId } = sync.addEmptyStructuredBlock(doc, "flowScheduleHorizontal");
    return { document: sync.addFirstOutlineNode(document, blockId), blockId };
  }

  it("generates a rounded-corner card, an untracked number, and a label per step", () => {
    const { document, blockId } = flowScheduleHorizontalBlock(createEmptyDocument());
    const stepId = nodeId(document, blockId, 0);
    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    const card = shapes.find((s) => s.type === "rect")!;
    expect(card.type === "rect" && card.cornerRadius).toBeGreaterThan(0);
    expect(shapes.some((s) => s.type === "text" && s.content === "01" && s.templateNodeIds?.length === 0)).toBe(true);
    const label = shapes.find((s) => s.type === "text" && s.templateNodeIds?.includes(stepId));
    expect(label).toBeDefined();
  });

  it("updateBlockParams({ title }) on a flowScheduleHorizontal regenerates a title label shape with the new text", () => {
    const { document, blockId } = flowScheduleHorizontalBlock(createEmptyDocument());
    const next = sync.updateBlockParams(document, blockId, { title: "フロースケジュール（横）" });
    const shapes = next.structuredBlocks[0].generatedShapeIds.map((id) => next.shapes[id]);
    const title = shapes.find((s) => s.type === "text" && s.content === "フロースケジュール（横）");
    expect(title).toBeDefined();
  });

  it("editing a step's text patches its label shape's content in place without moving any shape", () => {
    const { document, blockId } = flowScheduleHorizontalBlock(createEmptyDocument());
    const stepId = nodeId(document, blockId, 0);

    const before = document.structuredBlocks[0].generatedShapeIds.map((id) => ({ ...document.shapes[id] }));
    const after = sync.updateOutlineNodeText(document, blockId, stepId, "お問い合わせ");
    const afterShapes = after.structuredBlocks[0].generatedShapeIds.map((id) => after.shapes[id]);

    expect(afterShapes.map((s) => ({ x: s.x, y: s.y }))).toEqual(before.map((s) => ({ x: s.x, y: s.y })));
    const label = afterShapes.find((s) => s.type === "text" && s.templateNodeIds?.includes(stepId));
    expect(label?.type === "text" && label.content).toBe("お問い合わせ");
  });

  it("reordering steps (move up/down) regenerates each card's number for its new index", () => {
    let { document, blockId } = flowScheduleHorizontalBlock(createEmptyDocument());
    const firstId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, firstId);
    const secondId = document.structuredBlocks[0].outline[1].id;

    document = sync.moveOutlineNode(document, blockId, secondId, "up");

    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    const movedCard = shapes.find((s) => s.type === "rect" && s.templateNodeIds?.includes(secondId))!;
    const pushedCard = shapes.find((s) => s.type === "rect" && s.templateNodeIds?.includes(firstId))!;
    expect(movedCard.x).toBeLessThan(pushedCard.x);
  });
});

describe("timeline blocks (fully-relayouted pattern)", () => {
  function timelineBlock(doc: Document) {
    const { document, blockId } = sync.addEmptyStructuredBlock(doc, "timeline");
    return { document: sync.addFirstOutlineNode(document, blockId), blockId };
  }

  it("fills a newly-added event with a time slot", () => {
    const { document, blockId } = timelineBlock(createEmptyDocument());
    const block = document.structuredBlocks.find((b) => b.id === blockId)!;
    expect(block.outline[0].children).toHaveLength(1);
  });

  it("generates a filled dot, an untracked-by-default time label, and a description label", () => {
    const { document, blockId } = timelineBlock(createEmptyDocument());
    const eventId = nodeId(document, blockId, 0);
    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    const dot = shapes.find((s) => s.type === "ellipse")!;
    expect(dot.templateNodeIds).toEqual([eventId]);
    const timeId = document.structuredBlocks[0].outline[0].children[0].id;
    const timeLabel = shapes.find((s) => s.templateNodeIds?.includes(timeId));
    expect(timeLabel).toBeDefined();
  });

  it("draws exactly one thick gray track line, regardless of event count", () => {
    let { document, blockId } = timelineBlock(createEmptyDocument());
    const firstId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, firstId);
    document = sync.addOutlineSibling(document, blockId, document.structuredBlocks[0].outline[1].id);

    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    const tracks = shapes.filter((s) => s.type === "arrow" || (s.type === "line" && s.style.strokeWidth > 2));
    expect(tracks).toHaveLength(1);
  });

  it("updateBlockParams({ title }) on a timeline regenerates a title label shape with the new text", () => {
    const { document, blockId } = timelineBlock(createEmptyDocument());
    const next = sync.updateBlockParams(document, blockId, { title: "1日のスケジュール" });
    const shapes = next.structuredBlocks[0].generatedShapeIds.map((id) => next.shapes[id]);
    const title = shapes.find((s) => s.type === "text" && s.content === "1日のスケジュール");
    expect(title).toBeDefined();
  });

  it("editing an event's description patches its shape's content in place without moving any shape", () => {
    const { document, blockId } = timelineBlock(createEmptyDocument());
    const eventId = nodeId(document, blockId, 0);

    const before = document.structuredBlocks[0].generatedShapeIds.map((id) => ({ ...document.shapes[id] }));
    const after = sync.updateOutlineNodeText(document, blockId, eventId, "出社。");
    const afterShapes = after.structuredBlocks[0].generatedShapeIds.map((id) => after.shapes[id]);

    expect(afterShapes.map((s) => ({ x: s.x, y: s.y }))).toEqual(before.map((s) => ({ x: s.x, y: s.y })));
    const label = afterShapes.find((s) => s.type === "text" && s.templateNodeIds?.includes(eventId) && s.style.fontWeight !== "bold");
    expect(label?.type === "text" && label.content).toBe("出社。");
  });

  it("indenting a root event under another removes its now-orphaned shapes instead of leaving them stale", () => {
    let { document, blockId } = timelineBlock(createEmptyDocument());
    const firstId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, firstId);
    const secondId = document.structuredBlocks[0].outline[1].id;

    document = sync.indentOutlineNode(document, blockId, secondId);

    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    expect(shapes.some((s) => s.templateNodeIds?.includes(secondId))).toBe(false);
  });
});

describe("chevronFlow blocks (fully-relayouted pattern)", () => {
  function chevronFlowBlock(doc: Document) {
    const { document, blockId } = sync.addEmptyStructuredBlock(doc, "chevronFlow");
    return { document: sync.addFirstOutlineNode(document, blockId), blockId };
  }

  it("fills a newly-added step with a duration slot", () => {
    const { document, blockId } = chevronFlowBlock(createEmptyDocument());
    const block = document.structuredBlocks.find((b) => b.id === blockId)!;
    expect(block.outline[0].children).toHaveLength(1);
  });

  it("draws the chevron and body box as unfilled theme-colored outlines", () => {
    const { document } = chevronFlowBlock(createEmptyDocument());
    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    const outlines = shapes.filter((s) => s.type === "polygon");
    expect(outlines).toHaveLength(2);
    for (const o of outlines) {
      expect(o.style.fill).toBe("none");
      expect(o.style.stroke).not.toBe("none");
    }
  });

  it("editing a duration patches its shape's content in place without moving any shape", () => {
    const { document, blockId } = chevronFlowBlock(createEmptyDocument());
    const durationId = document.structuredBlocks[0].outline[0].children[0].id;

    const before = document.structuredBlocks[0].generatedShapeIds.map((id) => ({ ...document.shapes[id] }));
    const after = sync.updateOutlineNodeText(document, blockId, durationId, "1週間");
    const afterShapes = after.structuredBlocks[0].generatedShapeIds.map((id) => after.shapes[id]);

    expect(afterShapes.map((s) => ({ x: s.x, y: s.y }))).toEqual(before.map((s) => ({ x: s.x, y: s.y })));
    const label = afterShapes.find((s) => s.type === "text" && s.templateNodeIds?.includes(durationId));
    expect(label?.type === "text" && label.content).toBe("1週間");
  });

  it("renumbers the 'Step N' labels when steps are reordered", () => {
    let { document, blockId } = chevronFlowBlock(createEmptyDocument());
    const firstId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, firstId);
    document = sync.updateOutlineNodeText(document, blockId, firstId, "最初");

    document = sync.moveOutlineNode(document, blockId, firstId, "down");

    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    const title = shapes.find((s) => s.type === "text" && s.content === "最初")!;
    const number2 = shapes.find((s) => s.type === "text" && s.content === "2")!;
    expect(title.x).toBeLessThan(number2.x + 60);
    expect(title.x).toBeGreaterThan(number2.x - 60);
  });

  // Unlike timeline's events, an indented step doesn't vanish - it lands at
  // child[1..] of the previous step, i.e. becomes one of its bullets - but
  // its old chevron/body box must not be left behind.
  it("indenting a root step under another turns it into a bullet and drops its stale chevron", () => {
    let { document, blockId } = chevronFlowBlock(createEmptyDocument());
    const firstId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, firstId);
    const secondId = document.structuredBlocks[0].outline[1].id;

    document = sync.indentOutlineNode(document, blockId, secondId);

    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    expect(shapes.filter((s) => s.type === "polygon")).toHaveLength(2);
    const bullet = shapes.find((s) => s.templateNodeIds?.includes(secondId));
    expect(bullet?.type === "text" && bullet.bulletMarker).toBe("> ");
  });
});

describe("gridMatrix blocks (fully-relayouted pattern)", () => {
  function gridMatrixBlock(doc: Document) {
    const { document, blockId } = sync.addEmptyStructuredBlock(doc, "gridMatrix");
    return { document: sync.addFirstOutlineNode(document, blockId), blockId };
  }
  const tilesOf = (doc: Document) =>
    doc.structuredBlocks[0].generatedShapeIds.map((id) => doc.shapes[id]).filter((s) => s.type === "rect" && s.cornerRadius === undefined);

  it("starts as a 3x3 grid with both axes", () => {
    const { document } = gridMatrixBlock(createEmptyDocument());
    const outline = document.structuredBlocks[0].outline;
    expect(outline).toHaveLength(2);
    expect(outline.map((axis) => axis.children.length)).toEqual([3, 3]);
    expect(tilesOf(document)).toHaveLength(9);
  });

  it("adds a column of tiles when a column label is added", () => {
    let { document, blockId } = gridMatrixBlock(createEmptyDocument());
    const lastColumn = document.structuredBlocks[0].outline[0].children[2].id;
    document = sync.addOutlineSibling(document, blockId, lastColumn);
    expect(tilesOf(document)).toHaveLength(12);
  });

  it("does not drift when regenerated despite the rotated vertical axis name", () => {
    let { document, blockId } = gridMatrixBlock(createEmptyDocument());
    const yAxisId = document.structuredBlocks[0].outline[1].id;
    const rotated = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]).find((s) => s.templateNodeIds?.includes(yAxisId))!;
    expect(rotated.rotation).toBe(-90);
    const before = tilesOf(document).map((s) => ({ x: s.x, y: s.y }));

    document = sync.updateBlockParams(document, blockId, { title: "" });
    document = sync.updateBlockParams(document, blockId, { title: "" });

    expect(tilesOf(document).map((s) => ({ x: s.x, y: s.y }))).toEqual(before);
  });
});

describe("cycle blocks (fully-relayouted pattern)", () => {
  it("re-lays out every arrow around the ring when a step is added", () => {
    let { document, blockId } = sync.addEmptyStructuredBlock(createEmptyDocument(), "cycle");
    document = sync.addFirstOutlineNode(document, blockId);
    const firstId = nodeId(document, blockId, 0);
    const polygonOf = (doc: Document) =>
      doc.structuredBlocks[0].generatedShapeIds.map((id) => doc.shapes[id]).find((s) => s.type === "polygon" && s.templateNodeIds?.includes(firstId))!;
    const before = polygonOf(document);

    document = sync.addOutlineSibling(document, blockId, firstId);

    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    expect(shapes.filter((s) => s.type === "polygon")).toHaveLength(2);
    expect(polygonOf(document).width).not.toBe(before.width);
  });

  it("shows the center title as an untracked label", () => {
    let { document, blockId } = sync.addEmptyStructuredBlock(createEmptyDocument(), "cycleWithEntry");
    document = sync.addFirstOutlineNode(document, blockId);
    document = sync.updateBlockParams(document, blockId, { title: "格差の連鎖" });
    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    const title = shapes.find((s) => s.type === "text" && s.content === "格差の連鎖");
    expect(title?.templateNodeIds ?? []).toEqual([]);
  });
});

describe("beforeAfter blocks (fully-relayouted pattern)", () => {
  function beforeAfterBlock(doc: Document) {
    const { document, blockId } = sync.addEmptyStructuredBlock(doc, "beforeAfter");
    return { document: sync.addFirstOutlineNode(document, blockId), blockId };
  }

  it("fills a newly-added topic with both an ASIS and a TOBE slot", () => {
    const { document, blockId } = beforeAfterBlock(createEmptyDocument());
    const block = document.structuredBlocks.find((b) => b.id === blockId)!;
    expect(block.outline[0].children).toHaveLength(2);
  });

  it("generates ASIS/TOBE cell shapes for the topic, plus the fixed AS-IS/TO-BE sidebar", () => {
    const { document } = beforeAfterBlock(createEmptyDocument());
    const asisId = document.structuredBlocks[0].outline[0].children[0].id;
    const tobeId = document.structuredBlocks[0].outline[0].children[1].id;
    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    expect(shapes.some((s) => s.templateNodeIds?.includes(asisId))).toBe(true);
    expect(shapes.some((s) => s.templateNodeIds?.includes(tobeId))).toBe(true);
    expect(shapes.some((s) => s.type === "text" && s.content === "AS-IS")).toBe(true);
    expect(shapes.some((s) => s.type === "text" && s.content === "TO-BE")).toBe(true);
  });

  it("editing an ASIS headline's text patches its shape's content in place without moving any shape", () => {
    const { document, blockId } = beforeAfterBlock(createEmptyDocument());
    const asisId = document.structuredBlocks[0].outline[0].children[0].id;

    const before = document.structuredBlocks[0].generatedShapeIds.map((id) => ({ ...document.shapes[id] }));
    const after = sync.updateOutlineNodeText(document, blockId, asisId, "工期遅延等による計画変更");
    const afterShapes = after.structuredBlocks[0].generatedShapeIds.map((id) => after.shapes[id]);

    expect(afterShapes.map((s) => ({ x: s.x, y: s.y }))).toEqual(before.map((s) => ({ x: s.x, y: s.y })));
    const label = afterShapes.find((s) => s.type === "text" && s.templateNodeIds?.includes(asisId) && s.style.fontWeight === "bold");
    expect(label?.type === "text" && label.content).toBe("工期遅延等による計画変更");
  });

  it("editing the topic's own text patches the badge shape's content, independent of the ASIS headline", () => {
    const { document, blockId } = beforeAfterBlock(createEmptyDocument());
    const topicId = nodeId(document, blockId, 0);

    const after = sync.updateOutlineNodeText(document, blockId, topicId, "現場の悩み");
    const shapes = after.structuredBlocks[0].generatedShapeIds.map((id) => after.shapes[id]);
    const badge = shapes.find((s) => s.templateNodeIds?.includes(topicId));
    expect(badge?.type === "text" && badge.content).toBe("現場の悩み");
  });

  it("reordering topics (move up/down) regenerates the per-column arrow positions instead of leaving them stale", () => {
    let { document, blockId } = beforeAfterBlock(createEmptyDocument());
    const firstId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, firstId);
    const secondId = document.structuredBlocks[0].outline[1].id;

    document = sync.moveOutlineNode(document, blockId, secondId, "up");

    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    const asisId = document.structuredBlocks[0].outline[0].children[0].id; // now the moved-up topic
    const movedAsisCell = shapes.find((s) => s.type === "rect" && s.templateNodeIds?.includes(asisId))!;
    expect(movedAsisCell.x).toBeLessThan(140 + 24 + 340); // sits in the first column, left of the second
  });

  it("indenting a root topic under another removes its now-orphaned shapes instead of leaving them stale", () => {
    let { document, blockId } = beforeAfterBlock(createEmptyDocument());
    const firstId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, firstId);
    const secondId = document.structuredBlocks[0].outline[1].id;

    document = sync.indentOutlineNode(document, blockId, secondId);

    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    expect(shapes.some((s) => s.templateNodeIds?.includes(secondId))).toBe(false);
  });
});

describe("beforeAfterHorizontal blocks (fully-relayouted pattern)", () => {
  function beforeAfterHorizontalBlock(doc: Document) {
    const { document, blockId } = sync.addEmptyStructuredBlock(doc, "beforeAfterHorizontal");
    return { document: sync.addFirstOutlineNode(document, blockId), blockId };
  }

  it("fills a newly-added row with both a 'before' and an 'after' group", () => {
    const { document, blockId } = beforeAfterHorizontalBlock(createEmptyDocument());
    const block = document.structuredBlocks.find((b) => b.id === blockId)!;
    expect(block.outline[0].children).toHaveLength(2);
  });

  it("generates a heading shape for the row, plus the two column header shapes", () => {
    const { document, blockId } = beforeAfterHorizontalBlock(createEmptyDocument());
    const next = sync.updateBlockParams(document, blockId, { beforeLabel: "考慮すべき機会", afterLabel: "展開戦略" });
    const rowId = nodeId(next, blockId, 0);
    const shapes = next.structuredBlocks[0].generatedShapeIds.map((id) => next.shapes[id]);
    expect(shapes.some((s) => s.templateNodeIds?.includes(rowId))).toBe(true);
    expect(shapes.some((s) => s.type === "text" && s.content === "考慮すべき機会")).toBe(true);
    expect(shapes.some((s) => s.type === "text" && s.content === "展開戦略")).toBe(true);
  });

  it("editing a group's own text (its first bullet item) patches its shape's content in place", () => {
    const { document, blockId } = beforeAfterHorizontalBlock(createEmptyDocument());
    const beforeGroupId = document.structuredBlocks[0].outline[0].children[0].id;

    const before = document.structuredBlocks[0].generatedShapeIds.map((id) => ({ ...document.shapes[id] }));
    const after = sync.updateOutlineNodeText(document, blockId, beforeGroupId, "冷凍食品は市場規模が今後も拡大");
    const afterShapes = after.structuredBlocks[0].generatedShapeIds.map((id) => after.shapes[id]);

    expect(afterShapes.map((s) => ({ x: s.x, y: s.y }))).toEqual(before.map((s) => ({ x: s.x, y: s.y })));
    const label = afterShapes.find((s) => s.templateNodeIds?.includes(beforeGroupId));
    expect(label?.type === "text" && label.content).toBe("冷凍食品は市場規模が今後も拡大");
    expect(label?.type === "text" && label.bulletMarker).toBe("• ");
  });

  it("addOutlineChild on a 'before' group adds a bullet item, not a plain node at the wrong depth", () => {
    const { document, blockId } = beforeAfterHorizontalBlock(createEmptyDocument());
    const beforeGroupId = document.structuredBlocks[0].outline[0].children[0].id;
    const next = sync.addOutlineChild(document, blockId, beforeGroupId);
    const beforeGroup = next.structuredBlocks[0].outline[0].children[0];
    expect(beforeGroup.children).toHaveLength(1);
  });

  it("editing a bullet item's text patches its shape's content in place without moving any shape", () => {
    let { document, blockId } = beforeAfterHorizontalBlock(createEmptyDocument());
    const beforeGroupId = document.structuredBlocks[0].outline[0].children[0].id;
    document = sync.addOutlineChild(document, blockId, beforeGroupId);
    const itemId = document.structuredBlocks[0].outline[0].children[0].children[0].id;

    const before = document.structuredBlocks[0].generatedShapeIds.map((id) => ({ ...document.shapes[id] }));
    const after = sync.updateOutlineNodeText(document, blockId, itemId, "冷凍食品は市場規模が今後も拡大");
    const afterShapes = after.structuredBlocks[0].generatedShapeIds.map((id) => after.shapes[id]);

    expect(afterShapes.map((s) => ({ x: s.x, y: s.y }))).toEqual(before.map((s) => ({ x: s.x, y: s.y })));
    const label = afterShapes.find((s) => s.templateNodeIds?.includes(itemId));
    expect(label?.type === "text" && label.content).toBe("冷凍食品は市場規模が今後も拡大");
  });

  it("updateBlockParams({ beforeLabel, afterLabel }) regenerates both column header shapes with the new text", () => {
    const { document, blockId } = beforeAfterHorizontalBlock(createEmptyDocument());
    const next = sync.updateBlockParams(document, blockId, { beforeLabel: "考慮すべき機会", afterLabel: "展開戦略" });
    const shapes = next.structuredBlocks[0].generatedShapeIds.map((id) => next.shapes[id]);
    expect(shapes.some((s) => s.type === "text" && s.content === "考慮すべき機会")).toBe(true);
    expect(shapes.some((s) => s.type === "text" && s.content === "展開戦略")).toBe(true);
  });

  it("reordering rows (move up/down) regenerates the row-separator/arrow positions instead of leaving them stale", () => {
    let { document, blockId } = beforeAfterHorizontalBlock(createEmptyDocument());
    const firstId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, firstId);
    // Give the first row extra bullet items, so its row height (and every
    // shape's position below it) differs from a fresh, un-reordered layout -
    // a stale relayoutBlock would misplace the untracked separator/arrow.
    document = sync.addOutlineChild(document, blockId, document.structuredBlocks[0].outline[0].children[0].id);
    document = sync.addOutlineChild(document, blockId, document.structuredBlocks[0].outline[0].children[0].id);
    const secondId = document.structuredBlocks[0].outline[1].id;

    document = sync.moveOutlineNode(document, blockId, secondId, "up");

    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    const movedHeading = shapes.find((s) => s.type === "text" && s.templateNodeIds?.includes(secondId))!;
    const pushedHeading = shapes.find((s) => s.type === "text" && s.templateNodeIds?.includes(firstId))!;
    // secondId (now first, no bullet items) sits above firstId (now second,
    // with the extra bullet items) - a stale layout would keep them in their
    // original order instead.
    expect(movedHeading.y).toBeLessThan(pushedHeading.y);
  });

  it("indenting a root row under another removes its now-orphaned shapes instead of leaving them stale", () => {
    let { document, blockId } = beforeAfterHorizontalBlock(createEmptyDocument());
    const firstId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, firstId);
    const secondId = document.structuredBlocks[0].outline[1].id;

    document = sync.indentOutlineNode(document, blockId, secondId);

    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    expect(shapes.some((s) => s.templateNodeIds?.includes(secondId))).toBe(false);
  });
});

describe("schedule blocks (fully-relayouted pattern)", () => {
  function scheduleBlock(doc: Document) {
    const { document, blockId } = sync.addEmptyStructuredBlock(doc, "schedule");
    return { document: sync.addFirstOutlineNode(document, blockId), blockId };
  }

  it("fills a newly-added row with one bar that has a start/end date slot", () => {
    const { document, blockId } = scheduleBlock(createEmptyDocument());
    const block = document.structuredBlocks.find((b) => b.id === blockId)!;
    expect(block.outline[0].children).toHaveLength(1);
    expect(block.outline[0].children[0].children).toHaveLength(2);
  });

  it("defaults the start month to this month, not a fixed month, when the user hasn't set one", () => {
    const { document } = scheduleBlock(createEmptyDocument());
    const today = new Date();
    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    expect(shapes.some((s) => s.type === "text" && s.content === `${today.getFullYear()}年`)).toBe(true);
    expect(shapes.some((s) => s.type === "text" && s.content === `${today.getMonth() + 1}月`)).toBe(true);
  });

  it("addOutlineChild on a row adds another bar with its own date slots, not a plain node", () => {
    let { document, blockId } = scheduleBlock(createEmptyDocument());
    const rowId = document.structuredBlocks[0].outline[0].id;
    document = sync.addOutlineChild(document, blockId, rowId);
    const row = document.structuredBlocks[0].outline[0];
    expect(row.children).toHaveLength(2);
    expect(row.children[1].children).toHaveLength(2);
  });

  it("renders no bar shape until both of its dates are filled in", () => {
    let { document, blockId } = scheduleBlock(createEmptyDocument());
    const bar = document.structuredBlocks[0].outline[0].children[0];
    let shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    expect(shapes.some((s) => s.templateNodeIds?.includes(bar.id))).toBe(false);

    document = sync.updateOutlineNodeText(document, blockId, bar.children[0].id, "2018-06-01");
    shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    expect(shapes.some((s) => s.templateNodeIds?.includes(bar.id))).toBe(false); // still missing the end date

    document = sync.updateOutlineNodeText(document, blockId, bar.children[1].id, "2018-06-10");
    shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    expect(shapes.some((s) => s.templateNodeIds?.includes(bar.id))).toBe(true);
  });

  it("renders the bar's own label text once both dates are set", () => {
    let { document, blockId } = scheduleBlock(createEmptyDocument());
    const bar = document.structuredBlocks[0].outline[0].children[0];
    document = sync.updateOutlineNodeText(document, blockId, bar.children[0].id, "2018-06-01");
    document = sync.updateOutlineNodeText(document, blockId, bar.children[1].id, "2018-06-10");
    document = sync.updateOutlineNodeText(document, blockId, bar.id, "連携可能性の検討");

    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    const barShape = shapes.find((s) => s.templateNodeIds?.includes(bar.id));
    expect(barShape).toBeDefined();
    expect(barShape!.type === "text" && barShape!.content).toBe("連携可能性の検討");
  });

  it("updateBlockParams with a month range regenerates the year/month header text", () => {
    let { document, blockId } = scheduleBlock(createEmptyDocument());
    document = sync.updateBlockParams(document, blockId, { startYear: 2020, startMonth: 4, columnCount: 3 });
    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    expect(shapes.some((s) => s.type === "text" && s.content === "2020年")).toBe(true);
    expect(shapes.some((s) => s.type === "text" && s.content === "4月")).toBe(true);
  });

  it("updateBlockParams({ milestones }) adds a triangle marker shape", () => {
    let { document, blockId } = scheduleBlock(createEmptyDocument());
    document = sync.updateBlockParams(document, blockId, { milestones: [{ date: "2018-06-29", label: "中間報告書①" }] });
    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    expect(shapes.some((s) => s.type === "polygon")).toBe(true);
    expect(shapes.some((s) => s.type === "text" && s.content === "中間報告書①(6/29)")).toBe(true);
  });

  it("updateBlockParams({ connections }) draws a solid, marker-tipped arrow shape between two bars", () => {
    let { document, blockId } = scheduleBlock(createEmptyDocument());
    const bar1 = document.structuredBlocks[0].outline[0].children[0];
    document = sync.updateOutlineNodeText(document, blockId, bar1.children[0].id, "2018-06-01");
    document = sync.updateOutlineNodeText(document, blockId, bar1.children[1].id, "2018-06-10");
    document = sync.addOutlineChild(document, blockId, document.structuredBlocks[0].outline[0].id);
    const bar2 = document.structuredBlocks[0].outline[0].children[1];
    document = sync.updateOutlineNodeText(document, blockId, bar2.children[0].id, "2018-06-15");
    document = sync.updateOutlineNodeText(document, blockId, bar2.children[1].id, "2018-06-25");

    document = sync.updateBlockParams(document, blockId, { connections: { [bar1.id]: bar2.id } });
    const shapes = document.structuredBlocks[0].generatedShapeIds.map((id) => document.shapes[id]);
    const connector = shapes.find((s) => s.type === "arrow" && s.style.strokeDasharray === undefined);
    expect(connector).toBeDefined();
    expect(connector!.type === "arrow" && connector!.points).toHaveLength(2);
  });

  it("reordering rows (move up/down) regenerates the whole grid instead of leaving stale header/connector shapes", () => {
    let { document, blockId } = scheduleBlock(createEmptyDocument());
    const row1Id = document.structuredBlocks[0].outline[0].id;
    document = sync.addOutlineSibling(document, blockId, row1Id);
    const row2Id = document.structuredBlocks[0].outline[1].id;

    const beforeIds = new Set(document.structuredBlocks[0].generatedShapeIds);
    document = sync.moveOutlineNode(document, blockId, row2Id, "up");
    const afterIds = document.structuredBlocks[0].generatedShapeIds;

    expect(afterIds.length).toBeGreaterThan(0);
    for (const id of afterIds) expect(beforeIds.has(id)).toBe(false); // fully regenerated, not stale
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

describe("tree connector lines (ツリー図)", () => {
  function lineShapesFor(document: Document, blockId: string) {
    const block = document.structuredBlocks.find((b) => b.id === blockId)!;
    return block.generatedShapeIds.map((id) => document.shapes[id]).filter((s) => s.type === "line");
  }

  it("draws a parent-child connector in the fixed pale gray, not dashed", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);
    document = sync.addOutlineChild(document, blockId, rootId);

    const lines = lineShapesFor(document, blockId);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.style.stroke).toBe("#c7c7c7");
      expect(line.style.strokeDasharray).toBeUndefined();
    }
  });

  it("draws just a vertical stub for a single child (no horizontal bus needed)", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);
    document = sync.addOutlineChild(document, blockId, rootId);

    const lines = lineShapesFor(document, blockId);
    expect(lines).toHaveLength(2); // parent-bottom -> bus, bus -> child-top
    expect(lines.every((l) => l.width === 0)).toBe(true); // both segments purely vertical
  });

  it("places the horizontal bus at the midpoint between the parent's bottom and the child's top, not a fixed offset", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);
    document = sync.addOutlineChild(document, blockId, rootId);

    const lines = lineShapesFor(document, blockId);
    const parentStub = lines.find((l) => l.y === lines.reduce((min, l2) => Math.min(min, l2.y), Infinity))!;
    const childStub = lines.find((l) => l !== parentStub)!;
    // Same-length vertical segments on either side of the bus = true midpoint.
    expect(Math.abs(parentStub.height)).toBeCloseTo(Math.abs(childStub.height));
  });

  it("draws a horizontal bus line spanning both children once a root has two", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);
    document = sync.addOutlineChild(document, blockId, rootId);
    const firstChildId = document.structuredBlocks[0].outline[0].children[0].id;
    document = sync.addOutlineSibling(document, blockId, firstChildId);

    const lines = lineShapesFor(document, blockId);
    // vertical parent stub + horizontal bus + 2 vertical child stubs.
    expect(lines).toHaveLength(4);
    const bus = lines.find((l) => l.height === 0 && l.width !== 0)!;
    expect(bus).toBeDefined();

    const childIds = document.structuredBlocks[0].outline[0].children.map((c) => c.id);
    const childCenters = childIds.map((id) => {
      const shape = Object.values(document.shapes).find((s) => s.templateNodeIds?.includes(id))!;
      return shape.x + shape.width / 2;
    });
    expect(Math.min(bus.x, bus.x + bus.width)).toBeCloseTo(Math.min(...childCenters));
    expect(Math.max(bus.x, bus.x + bus.width)).toBeCloseTo(Math.max(...childCenters));
  });

  it("shrinks the connector when a child is removed, and clears it once the last child is gone", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);
    document = sync.addOutlineChild(document, blockId, rootId);
    const firstChildId = document.structuredBlocks[0].outline[0].children[0].id;
    document = sync.addOutlineSibling(document, blockId, firstChildId);
    const secondChildId = document.structuredBlocks[0].outline[0].children[1].id;
    expect(lineShapesFor(document, blockId)).toHaveLength(4); // bus + 2 stubs + parent stub

    document = sync.deleteOutlineNode(document, blockId, secondChildId);
    expect(lineShapesFor(document, blockId)).toHaveLength(2); // back to single-child, no bus

    document = sync.deleteOutlineNode(document, blockId, firstChildId);
    expect(lineShapesFor(document, blockId)).toHaveLength(0); // no children left, no connector
  });

  it("creates a connector once indenting turns a sibling into a child, and clears it on outdent", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const firstRootId = nodeId(document, blockId, 0);
    document = sync.addOutlineSibling(document, blockId, firstRootId);
    const secondRootId = document.structuredBlocks[0].outline[1].id;
    expect(lineShapesFor(document, blockId)).toHaveLength(0); // two independent roots, no connector yet

    document = sync.indentOutlineNode(document, blockId, secondRootId);
    expect(lineShapesFor(document, blockId)).toHaveLength(2); // now parent-child

    document = sync.outdentOutlineNode(document, blockId, secondRootId);
    expect(lineShapesFor(document, blockId)).toHaveLength(0); // back to independent roots
  });

  it("regenerates (fresh shape ids) rather than leaving stale connector shapes after reordering", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const rootId = nodeId(document, blockId, 0);
    document = sync.addOutlineChild(document, blockId, rootId);
    const firstChildId = document.structuredBlocks[0].outline[0].children[0].id;
    document = sync.addOutlineSibling(document, blockId, firstChildId);
    const secondChildId = document.structuredBlocks[0].outline[0].children[1].id;

    const beforeIds = new Set(lineShapesFor(document, blockId).map((l) => l.id));
    document = sync.moveOutlineNode(document, blockId, secondChildId, "up");
    const afterLines = lineShapesFor(document, blockId);

    expect(afterLines).toHaveLength(4); // same connector shape count/roles
    for (const line of afterLines) expect(beforeIds.has(line.id)).toBe(false); // but freshly regenerated
  });

  it("draws connectors for a bulk-imported outline (replaceOutline) too", () => {
    let { document, blockId } = pyramidBlock(createEmptyDocument());
    const newOutline = [
      {
        id: "n1",
        text: "root",
        children: [
          { id: "n2", text: "a", children: [] },
          { id: "n3", text: "b", children: [] },
        ],
      },
    ];
    document = sync.replaceOutline(document, blockId, newOutline);

    expect(lineShapesFor(document, blockId)).toHaveLength(4); // parent stub + bus + 2 child stubs
  });

  it("draws a rightward elbow connector (horizontal stubs, vertical bus) for logicTree too", () => {
    const { document: base, blockId } = sync.addEmptyStructuredBlock(createEmptyDocument(), "logicTree");
    let document = sync.addFirstOutlineNode(base, blockId);
    const rootId = nodeId(document, blockId, 0);
    document = sync.addOutlineChild(document, blockId, rootId);
    const firstChildId = document.structuredBlocks[0].outline[0].children[0].id;
    document = sync.addOutlineSibling(document, blockId, firstChildId);

    const lines = lineShapesFor(document, blockId);
    expect(lines).toHaveLength(4); // parent stub + bus + 2 child stubs
    // Stubs run horizontally (zero height); only the bus runs vertically.
    expect(lines.filter((l) => l.height === 0)).toHaveLength(3);
    const bus = lines.find((l) => l.width === 0)!;
    expect(bus).toBeDefined();
  });

  it("does not draw connectors for a fixed-hierarchy pattern (e.g. matrix)", () => {
    const { document: base, blockId } = sync.addEmptyStructuredBlock(createEmptyDocument(), "matrix");
    let document = sync.addFirstOutlineNode(base, blockId);
    const rootId = nodeId(document, blockId, 0);
    document = sync.addOutlineChild(document, blockId, rootId);

    expect(lineShapesFor(document, blockId)).toHaveLength(0);
  });
});

describe("tree node spacing (reproducing the reported bug: uneven sibling gaps)", () => {
  // aaa -> bbb -> CCC
  //     -> ddd -> DDD, EEE
  // The reported bug: DDD-EEE's gap came out much larger than CCC-DDD's,
  // even though both are a "row" of the same tree - a symptom of the old
  // newNodeOffset returning a fixed TOTAL offset tuned for the original
  // 160x60 default node size, rather than deriving the gap from each
  // reference node's own actual size.
  function shapeFor(doc: Document, nid: string) {
    return Object.values(doc.shapes).find((s) => s.templateNodeIds?.includes(nid))!;
  }

  it("logicTree: gives every sibling pair in the tree the same vertical gap", () => {
    const { document: base, blockId } = sync.addEmptyStructuredBlock(createEmptyDocument(), "logicTree");
    let document = sync.addFirstOutlineNode(base, blockId);
    const aaaId = nodeId(document, blockId, 0);

    document = sync.addOutlineChild(document, blockId, aaaId); // bbb
    const bbbId = document.structuredBlocks[0].outline[0].children[0].id;
    document = sync.addOutlineChild(document, blockId, bbbId); // CCC
    const cccId = document.structuredBlocks[0].outline[0].children[0].children[0].id;

    document = sync.addOutlineSibling(document, blockId, bbbId); // ddd
    const dddLowerId = document.structuredBlocks[0].outline[0].children[1].id;
    document = sync.addOutlineChild(document, blockId, dddLowerId); // DDD
    const DDDId = document.structuredBlocks[0].outline[0].children[1].children[0].id;
    document = sync.addOutlineSibling(document, blockId, DDDId); // EEE
    const EEEId = document.structuredBlocks[0].outline[0].children[1].children[1].id;

    const ccc = shapeFor(document, cccId);
    const DDD = shapeFor(document, DDDId);
    const EEE = shapeFor(document, EEEId);

    const cccToDDDGap = DDD.y - (ccc.y + ccc.height);
    const DDDToEEEGap = EEE.y - (DDD.y + DDD.height);
    expect(DDDToEEEGap).toBeCloseTo(cccToDDDGap);
  });

  it("pyramid: gives every sibling pair in the tree the same horizontal gap", () => {
    const { document: base, blockId } = sync.addEmptyStructuredBlock(createEmptyDocument(), "pyramid");
    let document = sync.addFirstOutlineNode(base, blockId);
    const aaaId = nodeId(document, blockId, 0);

    document = sync.addOutlineChild(document, blockId, aaaId); // bbb
    const bbbId = document.structuredBlocks[0].outline[0].children[0].id;
    document = sync.addOutlineChild(document, blockId, bbbId); // CCC
    const cccId = document.structuredBlocks[0].outline[0].children[0].children[0].id;

    document = sync.addOutlineSibling(document, blockId, bbbId); // ddd
    const dddLowerId = document.structuredBlocks[0].outline[0].children[1].id;
    document = sync.addOutlineChild(document, blockId, dddLowerId); // DDD
    const DDDId = document.structuredBlocks[0].outline[0].children[1].children[0].id;
    document = sync.addOutlineSibling(document, blockId, DDDId); // EEE
    const EEEId = document.structuredBlocks[0].outline[0].children[1].children[1].id;

    const ccc = shapeFor(document, cccId);
    const DDD = shapeFor(document, DDDId);
    const EEE = shapeFor(document, EEEId);

    const cccToDDDGap = DDD.x - (ccc.x + ccc.width);
    const DDDToEEEGap = EEE.x - (DDD.x + DDD.width);
    expect(DDDToEEEGap).toBeCloseTo(cccToDDDGap);
  });
});
