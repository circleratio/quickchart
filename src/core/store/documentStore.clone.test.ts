import { beforeEach, describe, expect, it } from "vitest";
import { useDocumentStore } from "./documentStore";
import { createShape } from "../model/shape";
import type { ConnectorShape, Shape, ShapeId } from "../model/shape";
import { anchorPosition } from "../layout/connector";

// doc/plan.md フェーズ15/§13: 複製・貼り付け時の図形の複製規則(doc/spec.md §4.1)。
function shapes(): Record<ShapeId, Shape> {
  return useDocumentStore.getState().document.shapes;
}

function addConnector(fromShapeId: ShapeId, toShapeId: ShapeId): ShapeId {
  const connector = {
    ...createShape("rect", { x: 0, y: 0 }, 0),
    type: "connector",
    fromShapeId,
    fromAnchor: "right",
    toShapeId,
    toAnchor: "left",
    points: [],
  } as ConnectorShape;
  useDocumentStore.getState().addShape(connector);
  return connector.id;
}

// Builds a pyramid (tree) block with a root and one child, returning the
// ids of the shapes it generated.
function addTreeBlock(): { blockId: string; shapeIds: ShapeId[] } {
  const store = useDocumentStore.getState();
  const blockId = store.addStructuredBlock("pyramid");
  useDocumentStore.getState().addFirstOutlineNode(blockId);
  const rootId = useDocumentStore.getState().document.structuredBlocks[0].outline[0].id;
  useDocumentStore.getState().addOutlineChild(blockId, rootId);
  const block = useDocumentStore.getState().document.structuredBlocks[0];
  return { blockId, shapeIds: [...block.generatedShapeIds] };
}

describe("documentStore copy/paste and duplicate rules", () => {
  beforeEach(() => {
    useDocumentStore.getState().newProject();
  });

  it("pastes template-generated shapes into another tab as plain shapes", () => {
    const { shapeIds } = addTreeBlock();
    const nodeShapeIds = shapeIds.filter((id) => (shapes()[id].templateNodeIds?.length ?? 0) > 0);
    expect(nodeShapeIds.length).toBeGreaterThan(0);
    const sourceBlockBefore = structuredClone(useDocumentStore.getState().document.structuredBlocks);
    useDocumentStore.getState().copyShapes(nodeShapeIds);

    const sourceTabId = useDocumentStore.getState().activeTabId;
    useDocumentStore.getState().addTab();
    const pastedIds = useDocumentStore.getState().pasteClipboard();

    expect(pastedIds).toHaveLength(nodeShapeIds.length);
    for (const id of pastedIds) expect(shapes()[id].templateNodeIds).toBeUndefined();
    expect(useDocumentStore.getState().document.structuredBlocks).toHaveLength(0);

    useDocumentStore.getState().switchTab(sourceTabId);
    expect(useDocumentStore.getState().document.structuredBlocks).toEqual(sourceBlockBefore);
  });

  it("drops the template link when duplicating within the same tab", () => {
    const { shapeIds } = addTreeBlock();
    const generatedBefore = [...useDocumentStore.getState().document.structuredBlocks[0].generatedShapeIds];
    const newIds = useDocumentStore.getState().duplicateShapes(shapeIds);

    for (const id of newIds) expect(shapes()[id].templateNodeIds).toBeUndefined();
    expect(useDocumentStore.getState().document.structuredBlocks[0].generatedShapeIds).toEqual(generatedBefore);
  });

  it("re-points a connector at the copies when both of its ends are copied too", () => {
    const a = createShape("rect", { x: 0, y: 0 }, 0);
    const b = createShape("rect", { x: 300, y: 0 }, 1);
    useDocumentStore.getState().addShape(a);
    useDocumentStore.getState().addShape(b);
    const connectorId = addConnector(a.id, b.id);

    useDocumentStore.getState().copyShapes([a.id, b.id, connectorId]);
    useDocumentStore.getState().addTab();
    const [newA, newB, newConnector] = useDocumentStore.getState().pasteClipboard();

    const pasted = shapes()[newConnector] as ConnectorShape;
    expect(pasted.fromShapeId).toBe(newA);
    expect(pasted.toShapeId).toBe(newB);
    expect(pasted.fromAnchor).toBe("right");
    expect(pasted.toAnchor).toBe("left");
  });

  it("detaches a connector end whose target was not copied, freezing it at its position", () => {
    const a = createShape("rect", { x: 0, y: 0 }, 0);
    const b = createShape("rect", { x: 300, y: 100 }, 1);
    useDocumentStore.getState().addShape(a);
    useDocumentStore.getState().addShape(b);
    const connectorId = addConnector(a.id, b.id);
    const bLeft = anchorPosition(shapes()[b.id], "left");

    useDocumentStore.getState().copyShapes([a.id, connectorId]);
    useDocumentStore.getState().addTab();
    const [newA, newConnector] = useDocumentStore.getState().pasteClipboard();

    const pasted = shapes()[newConnector] as ConnectorShape;
    expect(pasted.fromShapeId).toBe(newA);
    expect(pasted.toShapeId).toBeUndefined();
    expect(pasted.toAnchor).toBeUndefined();
    expect(pasted.points[1]).toEqual({ x: bLeft.x + 20, y: bLeft.y + 20 });
  });

  it("keeps the clipboard across tab switches and clears it on new/load", () => {
    const a = createShape("rect", { x: 0, y: 0 }, 0);
    useDocumentStore.getState().addShape(a);
    useDocumentStore.getState().copyShapes([a.id]);

    const firstTabId = useDocumentStore.getState().activeTabId;
    const secondTabId = useDocumentStore.getState().addTab();
    useDocumentStore.getState().switchTab(firstTabId);
    useDocumentStore.getState().switchTab(secondTabId);
    expect(useDocumentStore.getState().pasteClipboard()).toHaveLength(1);

    useDocumentStore.getState().newProject();
    expect(useDocumentStore.getState().clipboard).toHaveLength(0);
  });
});
