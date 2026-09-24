import { create } from "zustand";
import { produce } from "immer";
import { v4 as uuidv4 } from "uuid";
import type { Document } from "../model/document";
import { DEFAULT_LAYER_ID } from "../model/document";
import type { DocumentTab, ProjectFile } from "../model/project";
import { createDocumentTab, createEmptyProjectFile, PROJECT_FORMAT_VERSION } from "../model/project";
import type { Point, Shape, ShapeId, ShapePatch } from "../model/shape";
import type { StructuredBlock } from "../model/document";
import type { UserTemplate } from "../model/userTemplate";
import { instantiateTemplate } from "../model/userTemplate";
import { cloneShapesInto, detachExternalConnections } from "../model/shapeClone";
import { DocumentHistory } from "./historyMiddleware";
import * as sync from "../templates/sync";

type ZOrderDirection = "front" | "back" | "forward" | "backward";

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
  // Multiple tabs (doc/requirement.md §4.7, doc/spec.md §4.1): `document`/
  // `canUndo`/`canRedo` below are derived from whichever tab is active, kept
  // as plain fields so the ~20 existing `useDocumentStore((s) => s.document)`
  // call sites (and every addShape/updateOutlineNodeText/etc. action) don't
  // need to change at all.
  tabs: DocumentTab[];
  activeTabId: string;
  document: Document;
  clipboard: Shape[];
  canUndo: boolean;
  canRedo: boolean;
  // Unsaved-changes flag for the whole project file (doc/spec.md §9.2), not
  // per tab - saving/opening/creating a project always covers every tab.
  isDirty: boolean;
  undo: () => void;
  redo: () => void;
  // Project file identity (doc/spec.md §9). null until the document has been
  // saved/opened as a real file at least once.
  currentFilePath: string | null;
  setCurrentFilePath: (path: string | null) => void;
  // Replaces the whole project (New / Open a different file). Undo/Redo
  // history is reset for every tab since undoing across a file switch makes
  // no sense.
  newProject: () => void;
  loadProject: (file: ProjectFile, path: string | null) => void;
  // Snapshots the current tabs for saving (doc/spec.md §9.1).
  buildProjectFile: () => ProjectFile;
  markSaved: () => void;

  addTab: () => string;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
  reorderTabs: (draggedId: string, targetId: string) => void;

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
  // `paramsPatch`: params the imported text carries alongside the outline
  // (see sync.ts's replaceOutline).
  replaceOutline: (blockId: string, newOutline: StructuredBlock["outline"], paramsPatch?: Record<string, unknown>) => void;
  // Any change to a block's params - title, column headers, axis labels,
  // schedule settings, ... (see sync.ts's updateBlockParams).
  updateBlockParams: (blockId: string, patch: Record<string, unknown>) => void;

  // User templates (doc/spec.md §6.4): placing one adds plain shapes (no
  // structured-template linkage) - registering one is pure read + an IPC
  // call, so it doesn't need a store action, just PropertyPanel.tsx reading
  // document.shapes directly.
  placeUserTemplate: (template: UserTemplate, dropPoint: Point) => ShapeId[];
}

export const useDocumentStore = create<DocumentState>((set, get) => {
  // One Undo/Redo history per tab (doc/spec.md §4.1), keyed by DocumentTab.id.
  // Histories survive tab switches (switching away and back keeps that tab's
  // stack intact) and are discarded when a tab is closed or the whole project
  // is replaced.
  const histories = new Map<string, DocumentHistory<Document>>();
  // Snapshot of the active tab's `document` taken at the start of the current
  // pointer gesture (drag/resize/rotate), used by commitGesture() to record
  // one history step for the whole gesture. Null when no gesture is in
  // progress. A gesture is assumed to never span a tab switch (doc/spec.md
  // §4.1: the canvas holds pointer focus during a drag, so the tab bar can't
  // be operated mid-gesture).
  let gestureStart: Document | null = null;

  function historyFor(tabId: string): DocumentHistory<Document> {
    let history = histories.get(tabId);
    if (!history) {
      history = new DocumentHistory<Document>();
      histories.set(tabId, history);
    }
    return history;
  }

  // All document edits that should be undoable go through this helper, which
  // applies `recipe` to the *active* tab only. Actions that only touch
  // `clipboard` (copyShapes) bypass it and call `set` directly, since the
  // clipboard is excluded from Undo/Redo (see doc/spec.md §4) and shared
  // across tabs (doc/spec.md §4.1).
  function change(recipe: (draft: Document) => void, newIds: ShapeId[] = []): ShapeId[] {
    const state = get();
    const activeIndex = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
    if (activeIndex === -1) return newIds;
    const activeTab = state.tabs[activeIndex];
    const history = historyFor(activeTab.id);
    const next = history.apply(activeTab.document, recipe);
    if (next !== activeTab.document) {
      const tabs = state.tabs.slice();
      tabs[activeIndex] = { ...activeTab, document: next };
      set({ tabs, document: next, canUndo: history.canUndo, canRedo: history.canRedo, isDirty: true });
    }
    return newIds;
  }

  const initialProject = createEmptyProjectFile();

  return {
    tabs: initialProject.tabs,
    activeTabId: initialProject.activeTabId,
    document: initialProject.tabs[0].document,
    clipboard: [],
    canUndo: false,
    canRedo: false,
    isDirty: false,
    currentFilePath: null,

    undo: () => {
      const state = get();
      const activeIndex = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
      if (activeIndex === -1) return;
      const activeTab = state.tabs[activeIndex];
      const history = historyFor(activeTab.id);
      const next = history.undo(activeTab.document);
      if (!next) return;
      const tabs = state.tabs.slice();
      tabs[activeIndex] = { ...activeTab, document: next };
      set({ tabs, document: next, canUndo: history.canUndo, canRedo: history.canRedo, isDirty: true });
    },
    redo: () => {
      const state = get();
      const activeIndex = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
      if (activeIndex === -1) return;
      const activeTab = state.tabs[activeIndex];
      const history = historyFor(activeTab.id);
      const next = history.redo(activeTab.document);
      if (!next) return;
      const tabs = state.tabs.slice();
      tabs[activeIndex] = { ...activeTab, document: next };
      set({ tabs, document: next, canUndo: history.canUndo, canRedo: history.canRedo, isDirty: true });
    },

    setCurrentFilePath: (path) => set({ currentFilePath: path }),

    newProject: () => {
      histories.clear();
      gestureStart = null;
      const project = createEmptyProjectFile();
      set({
        tabs: project.tabs,
        activeTabId: project.activeTabId,
        document: project.tabs[0].document,
        clipboard: [],
        currentFilePath: null,
        canUndo: false,
        canRedo: false,
        isDirty: false,
      });
    },

    loadProject: (file, path) => {
      histories.clear();
      gestureStart = null;
      const activeTab = file.tabs.find((tab) => tab.id === file.activeTabId) ?? file.tabs[0];
      set({
        tabs: file.tabs,
        activeTabId: activeTab.id,
        document: activeTab.document,
        clipboard: [],
        currentFilePath: path,
        canUndo: false,
        canRedo: false,
        isDirty: false,
      });
    },

    buildProjectFile: () => {
      const state = get();
      return { formatVersion: PROJECT_FORMAT_VERSION, tabs: state.tabs, activeTabId: state.activeTabId };
    },

    markSaved: () => set({ isDirty: false }),

    addTab: () => {
      const state = get();
      const tab = createDocumentTab(`タブ${state.tabs.length + 1}`);
      set({
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
        document: tab.document,
        canUndo: false,
        canRedo: false,
        isDirty: true,
      });
      return tab.id;
    },

    closeTab: (id) => {
      const state = get();
      if (state.tabs.length <= 1) return;
      const index = state.tabs.findIndex((tab) => tab.id === id);
      if (index === -1) return;
      histories.delete(id);
      const tabs = state.tabs.filter((tab) => tab.id !== id);
      const activeTabId = state.activeTabId === id ? tabs[Math.min(index, tabs.length - 1)].id : state.activeTabId;
      const activeTab = tabs.find((tab) => tab.id === activeTabId)!;
      const history = historyFor(activeTabId);
      set({
        tabs,
        activeTabId,
        document: activeTab.document,
        canUndo: history.canUndo,
        canRedo: history.canRedo,
        isDirty: true,
      });
    },

    switchTab: (id) => {
      const state = get();
      const tab = state.tabs.find((t) => t.id === id);
      if (!tab) return;
      const history = historyFor(id);
      set({ activeTabId: id, document: tab.document, canUndo: history.canUndo, canRedo: history.canRedo });
    },

    renameTab: (id, name) => {
      set((state) => ({
        tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, name } : tab)),
        isDirty: true,
      }));
    },

    reorderTabs: (draggedId, targetId) => {
      set((state) => {
        if (draggedId === targetId) return state;
        const tabs = state.tabs.slice();
        const fromIndex = tabs.findIndex((tab) => tab.id === draggedId);
        const toIndex = tabs.findIndex((tab) => tab.id === targetId);
        if (fromIndex === -1 || toIndex === -1) return state;
        const [moved] = tabs.splice(fromIndex, 1);
        tabs.splice(toIndex, 0, moved);
        return { tabs, isDirty: true };
      });
    },

    beginGesture: () => {
      const state = get();
      gestureStart = state.tabs.find((tab) => tab.id === state.activeTabId)?.document ?? null;
    },

    updateShapeTransient: (id, patch) => {
      set((state) => {
        const activeIndex = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
        if (activeIndex === -1) return state;
        const activeTab = state.tabs[activeIndex];
        const nextDoc = produce(activeTab.document, (draft) => {
          const existing = draft.shapes[id];
          if (!existing) return;
          Object.assign(existing, patch);
        });
        const tabs = state.tabs.slice();
        tabs[activeIndex] = { ...activeTab, document: nextDoc };
        return { tabs, document: nextDoc };
      });
    },

    commitGesture: () => {
      if (!gestureStart) return;
      const before = gestureStart;
      gestureStart = null;
      const state = get();
      const activeIndex = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
      if (activeIndex === -1) return;
      const activeTab = state.tabs[activeIndex];
      const history = historyFor(activeTab.id);
      history.commit(before, activeTab.document);
      set({ canUndo: history.canUndo, canRedo: history.canRedo, isDirty: true });
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
        const selected = ids.map((id) => draft.shapes[id]).filter((s): s is Shape => Boolean(s));
        newIds = cloneShapesInto(draft, detachExternalConnections(selected, draft.shapes));
      });
      return newIds;
    },

    // The clipboard holds shapes already normalized against their source tab
    // (doc/spec.md §4.1), so pasting into another tab never refers back to
    // shapes that only exist in the tab they were copied from.
    copyShapes: (ids) =>
      set((state) => ({
        clipboard: detachExternalConnections(
          ids.map((id) => state.document.shapes[id]).filter((s): s is Shape => Boolean(s)),
          state.document.shapes,
        ),
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

    replaceOutline: (blockId, newOutline, paramsPatch) => {
      const next = sync.replaceOutline(get().document, blockId, newOutline, paramsPatch);
      change((draft) => {
        Object.assign(draft, next);
      });
    },

    updateBlockParams: (blockId, patch) => {
      const next = sync.updateBlockParams(get().document, blockId, patch);
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
