import { create } from "zustand";
import { produce } from "immer";
import { v4 as uuidv4 } from "uuid";
import type { Document } from "../model/document";
import { createEmptyDocument, DEFAULT_LAYER_ID } from "../model/document";
import type { Point, Shape, ShapeId, ShapePatch } from "../model/shape";
import type { StructuredBlock } from "../model/document";
import type { UserTemplate } from "../model/userTemplate";
import { instantiateTemplate } from "../model/userTemplate";
import { DocumentHistory } from "./historyMiddleware";
import * as sync from "../templates/sync";
import type { MatrixAxisParams } from "../templates/matrix";
import type { Milestone } from "../templates/schedule";

type ZOrderDirection = "front" | "back" | "forward" | "backward";

// Mutates `draft.shapes`/`draft.layers` in place (Immer draft) to add clones of
// `shapesToClone`, offset by a fixed amount. Shapes that shared a groupId keep
// sharing a (new) groupId with each other. Returns the new shapes' ids.
function cloneShapesInto(draft: Document, shapesToClone: Shape[]): ShapeId[] {
  const groupIdMap = new Map<string, string>();
  const defaultLayer = draft.layers.find((layer) => layer.id === DEFAULT_LAYER_ID);
  let nextZIndex = Object.keys(draft.shapes).length;
  const newIds: ShapeId[] = [];

  for (const original of shapesToClone) {
    const newId = uuidv4();
    let newGroupId: string | undefined;
    if (original.groupId) {
      if (!groupIdMap.has(original.groupId)) groupIdMap.set(original.groupId, uuidv4());
      newGroupId = groupIdMap.get(original.groupId);
    }
    const clone = {
      ...original,
      id: newId,
      x: original.x + 20,
      y: original.y + 20,
      groupId: newGroupId,
      zIndex: nextZIndex++,
    } as Shape;
    draft.shapes[newId] = clone;
    newIds.push(newId);
    defaultLayer?.shapeIds.push(newId);
  }

  return newIds;
}

// Mutates zIndex fields in `draft.shapes` in place to move `ids` front/back/etc,
// relative to their current stacking order.
function applyZOrder(draft: Document, ids: ShapeId[], direction: ZOrderDirection): void {
  const idSet = new Set(ids);
  let order = Object.values(draft.shapes)
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((shape) => shape.id);

  if (direction === "front") {
    order = [...order.filter((id) => !idSet.has(id)), ...order.filter((id) => idSet.has(id))];
  } else if (direction === "back") {
    order = [...order.filter((id) => idSet.has(id)), ...order.filter((id) => !idSet.has(id))];
  } else if (direction === "forward") {
    for (let i = order.length - 2; i >= 0; i--) {
      if (idSet.has(order[i]) && !idSet.has(order[i + 1])) {
        [order[i], order[i + 1]] = [order[i + 1], order[i]];
      }
    }
  } else {
    for (let i = 1; i < order.length; i++) {
      if (idSet.has(order[i]) && !idSet.has(order[i - 1])) {
        [order[i], order[i - 1]] = [order[i - 1], order[i]];
      }
    }
  }

  order.forEach((id, index) => {
    draft.shapes[id].zIndex = index;
  });
}

interface DocumentState {
  document: Document;
  clipboard: Shape[];
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  // Project file identity (doc/spec.md §9). null until the document has been
  // saved/opened as a real file at least once.
  currentFilePath: string | null;
  setCurrentFilePath: (path: string | null) => void;
  // Replaces the whole document (New / Open a different file). Undo/Redo
  // history is reset since undoing across a file switch makes no sense.
  newDocument: () => void;
  loadDocument: (doc: Document, path: string | null) => void;
  addShape: (shape: Shape) => void;
  updateShape: (id: ShapeId, patch: ShapePatch) => void;
  // Same as calling updateShape for each entry, but as a single undo step (e.g.
  // an align/distribute button click that repositions several shapes at once).
  updateShapes: (patches: Record<ShapeId, ShapePatch>) => void;
  removeShape: (id: ShapeId) => void;
  // Continuous-gesture path (pointer drag / resize / rotate): apply many
  // updateShapeTransient() calls with no history recorded, then commitGesture()
  // once at the end so the whole gesture is a single undo step (see doc/spec.md
  // §4 and the bug this fixed: per-pointermove Undo steps).
  beginGesture: () => void;
  updateShapeTransient: (id: ShapeId, patch: ShapePatch) => void;
  commitGesture: () => void;
  moveShape: (id: ShapeId, dx: number, dy: number) => void;
  duplicateShapes: (ids: ShapeId[]) => ShapeId[];
  copyShapes: (ids: ShapeId[]) => void;
  pasteClipboard: () => ShapeId[];
  groupShapes: (ids: ShapeId[]) => void;
  ungroupShapes: (ids: ShapeId[]) => void;
  bringToFront: (ids: ShapeId[]) => void;
  sendToBack: (ids: ShapeId[]) => void;
  bringForward: (ids: ShapeId[]) => void;
  setColorTheme: (themeId: string) => void;
  sendBackward: (ids: ShapeId[]) => void;

  // Structured templates (Phase 7, doc/spec.md §6). Each wraps a pure
  // core/templates/sync.ts function through the same history-tracked change()
  // helper as everything else, so creation/edits/deletes are all one undo
  // step each.
  addStructuredBlock: (pattern: StructuredBlock["pattern"]) => string;
  addFirstOutlineNode: (blockId: string) => void;
  addOutlineChild: (blockId: string, parentNodeId: string) => void;
  addOutlineSibling: (blockId: string, afterNodeId: string) => void;
  deleteOutlineNode: (blockId: string, nodeId: string) => void;
  updateOutlineNodeText: (blockId: string, nodeId: string, text: string) => void;
  updateShapeContent: (shapeId: ShapeId, content: string) => void;
  indentOutlineNode: (blockId: string, nodeId: string) => void;
  outdentOutlineNode: (blockId: string, nodeId: string) => void;
  moveOutlineNode: (blockId: string, nodeId: string, direction: "up" | "down") => void;
  replaceOutline: (blockId: string, newOutline: StructuredBlock["outline"]) => void;
  updateMatrixAxisLabels: (blockId: string, axisParams: MatrixAxisParams) => void;
  updateVennSetCount: (blockId: string, setCount: number) => void;
  updateBulletMatrixColumns: (blockId: string, columnHeaders: string[]) => void;
  replaceBulletMatrix: (blockId: string, columnHeaders: string[], newOutline: StructuredBlock["outline"]) => void;
  updatePyramidChartColumns: (blockId: string, columnHeaders: string[]) => void;
  updatePyramidChartTitle: (blockId: string, title: string) => void;
  updateScheduleMonths: (blockId: string, months: { startYear: number; startMonth: number; columnCount: number }) => void;
  updateScheduleMilestones: (blockId: string, milestones: Milestone[]) => void;
  updateScheduleConnections: (blockId: string, connections: Record<string, string>) => void;
  updateFlowScheduleTitle: (blockId: string, title: string) => void;

  // User templates (doc/spec.md §6.4): placing one adds plain shapes (no
  // structured-template linkage) - registering one is pure read + an IPC
  // call, so it doesn't need a store action, just PropertyPanel.tsx reading
  // document.shapes directly.
  placeUserTemplate: (template: UserTemplate, dropPoint: Point) => ShapeId[];
}

export const useDocumentStore = create<DocumentState>((set, get) => {
  const history = new DocumentHistory<Document>();
  // Snapshot of `document` taken at the start of the current pointer gesture
  // (drag/resize/rotate), used by commitGesture() to record one history step
  // for the whole gesture. Null when no gesture is in progress.
  let gestureStart: Document | null = null;

  // All document edits that should be undoable go through this helper. Actions
  // that only touch `clipboard` (copyShapes) bypass it and call `set` directly,
  // since the clipboard is excluded from Undo/Redo (see doc/spec.md §4).
  function change(recipe: (draft: Document) => void, newIds: ShapeId[] = []): ShapeId[] {
    const next = history.apply(get().document, recipe);
    if (next !== get().document) {
      set({ document: next, canUndo: history.canUndo, canRedo: history.canRedo });
    }
    return newIds;
  }

  return {
    document: createEmptyDocument(),
    clipboard: [],
    canUndo: false,
    canRedo: false,
    currentFilePath: null,

    undo: () => {
      const next = history.undo(get().document);
      if (next) set({ document: next, canUndo: history.canUndo, canRedo: history.canRedo });
    },
    redo: () => {
      const next = history.redo(get().document);
      if (next) set({ document: next, canUndo: history.canUndo, canRedo: history.canRedo });
    },

    setCurrentFilePath: (path) => set({ currentFilePath: path }),

    newDocument: () => {
      history.clear();
      gestureStart = null;
      set({
        document: createEmptyDocument(),
        clipboard: [],
        currentFilePath: null,
        canUndo: false,
        canRedo: false,
      });
    },

    loadDocument: (doc, path) => {
      history.clear();
      gestureStart = null;
      set({ document: doc, clipboard: [], currentFilePath: path, canUndo: false, canRedo: false });
    },

    beginGesture: () => {
      gestureStart = get().document;
    },

    updateShapeTransient: (id, patch) => {
      set((state) => ({
        document: produce(state.document, (draft) => {
          const existing = draft.shapes[id];
          if (!existing) return;
          Object.assign(existing, patch);
        }),
      }));
    },

    commitGesture: () => {
      if (!gestureStart) return;
      const before = gestureStart;
      gestureStart = null;
      history.commit(before, get().document);
      set({ canUndo: history.canUndo, canRedo: history.canRedo });
    },

    addShape: (shape) => {
      change((draft) => {
        draft.shapes[shape.id] = shape;
        const layer = draft.layers.find((l) => l.id === DEFAULT_LAYER_ID);
        layer?.shapeIds.push(shape.id);
      });
    },

    updateShape: (id, patch) => {
      change((draft) => {
        const existing = draft.shapes[id];
        if (!existing) return;
        Object.assign(existing, patch);
      });
    },

    updateShapes: (patches) => {
      change((draft) => {
        for (const [id, patch] of Object.entries(patches)) {
          const existing = draft.shapes[id];
          if (!existing) continue;
          Object.assign(existing, patch);
        }
      });
    },

    removeShape: (id) => {
      change((draft) => {
        if (!draft.shapes[id]) return;
        delete draft.shapes[id];
        for (const layer of draft.layers) {
          layer.shapeIds = layer.shapeIds.filter((shapeId) => shapeId !== id);
        }
      });
    },

    moveShape: (id, dx, dy) => {
      change((draft) => {
        const existing = draft.shapes[id];
        if (!existing) return;
        existing.x += dx;
        existing.y += dy;
      });
    },

    duplicateShapes: (ids) => {
      let newIds: ShapeId[] = [];
      change((draft) => {
        const shapesToClone = ids.map((id) => draft.shapes[id]).filter((s): s is Shape => Boolean(s));
        newIds = cloneShapesInto(draft, shapesToClone);
      });
      return newIds;
    },

    copyShapes: (ids) =>
      set((state) => ({
        clipboard: ids.map((id) => state.document.shapes[id]).filter((s): s is Shape => Boolean(s)),
      })),

    pasteClipboard: () => {
      const clipboard = get().clipboard;
      if (clipboard.length === 0) return [];
      let newIds: ShapeId[] = [];
      change((draft) => {
        newIds = cloneShapesInto(draft, clipboard);
      });
      return newIds;
    },

    groupShapes: (ids) => {
      if (ids.length < 2) return;
      const groupId = uuidv4();
      change((draft) => {
        for (const id of ids) {
          if (draft.shapes[id]) draft.shapes[id].groupId = groupId;
        }
      });
    },

    ungroupShapes: (ids) => {
      change((draft) => {
        for (const id of ids) {
          if (draft.shapes[id]) delete draft.shapes[id].groupId;
        }
      });
    },

    bringToFront: (ids) => change((draft) => applyZOrder(draft, ids, "front")),
    sendToBack: (ids) => change((draft) => applyZOrder(draft, ids, "back")),
    bringForward: (ids) => change((draft) => applyZOrder(draft, ids, "forward")),
    sendBackward: (ids) => change((draft) => applyZOrder(draft, ids, "backward")),

    setColorTheme: (themeId) => {
      change((draft) => {
        draft.colorThemeId = themeId;
      });
    },

    addStructuredBlock: (pattern) => {
      const { document: next, blockId } = sync.addEmptyStructuredBlock(get().document, pattern);
      change((draft) => {
        Object.assign(draft, next);
      });
      return blockId;
    },

    addFirstOutlineNode: (blockId) => {
      const next = sync.addFirstOutlineNode(get().document, blockId);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    addOutlineChild: (blockId, parentNodeId) => {
      const next = sync.addOutlineChild(get().document, blockId, parentNodeId);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    addOutlineSibling: (blockId, afterNodeId) => {
      const next = sync.addOutlineSibling(get().document, blockId, afterNodeId);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    deleteOutlineNode: (blockId, nodeId) => {
      const next = sync.deleteOutlineNode(get().document, blockId, nodeId);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    updateOutlineNodeText: (blockId, nodeId, text) => {
      const next = sync.updateOutlineNodeText(get().document, blockId, nodeId, text);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    updateShapeContent: (shapeId, content) => {
      const next = sync.updateShapeContentAndSync(get().document, shapeId, content);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    indentOutlineNode: (blockId, nodeId) => {
      const next = sync.indentOutlineNode(get().document, blockId, nodeId);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    outdentOutlineNode: (blockId, nodeId) => {
      const next = sync.outdentOutlineNode(get().document, blockId, nodeId);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    moveOutlineNode: (blockId, nodeId, direction) => {
      const next = sync.moveOutlineNode(get().document, blockId, nodeId, direction);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    replaceOutline: (blockId, newOutline) => {
      const next = sync.replaceOutline(get().document, blockId, newOutline);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    updateMatrixAxisLabels: (blockId, axisParams) => {
      const next = sync.updateMatrixAxisLabels(get().document, blockId, axisParams);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    updateVennSetCount: (blockId, setCount) => {
      const next = sync.updateVennSetCount(get().document, blockId, setCount);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    updateBulletMatrixColumns: (blockId, columnHeaders) => {
      const next = sync.updateBulletMatrixColumns(get().document, blockId, columnHeaders);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    replaceBulletMatrix: (blockId, columnHeaders, newOutline) => {
      const next = sync.replaceBulletMatrix(get().document, blockId, columnHeaders, newOutline);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    updatePyramidChartColumns: (blockId, columnHeaders) => {
      const next = sync.updatePyramidChartColumns(get().document, blockId, columnHeaders);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    updatePyramidChartTitle: (blockId, title) => {
      const next = sync.updatePyramidChartTitle(get().document, blockId, title);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    updateFlowScheduleTitle: (blockId, title) => {
      const next = sync.updateFlowScheduleTitle(get().document, blockId, title);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    updateScheduleMonths: (blockId, months) => {
      const next = sync.updateScheduleMonths(get().document, blockId, months);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    updateScheduleMilestones: (blockId, milestones) => {
      const next = sync.updateScheduleMilestones(get().document, blockId, milestones);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    updateScheduleConnections: (blockId, connections) => {
      const next = sync.updateScheduleConnections(get().document, blockId, connections);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    placeUserTemplate: (template, dropPoint) => {
      const startZIndex = Object.keys(get().document.shapes).length;
      const newShapes = instantiateTemplate(template, dropPoint, startZIndex);
      change((draft) => {
        for (const shape of newShapes) {
          draft.shapes[shape.id] = shape;
          const layer = draft.layers.find((l) => l.id === DEFAULT_LAYER_ID);
          layer?.shapeIds.push(shape.id);
        }
      });
      return newShapes.map((s) => s.id);
    },
  };
});
