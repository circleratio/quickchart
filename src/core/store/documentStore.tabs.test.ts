import { beforeEach, describe, expect, it } from "vitest";
import { useDocumentStore } from "./documentStore";
import { createShape } from "../model/shape";
import { createEmptyProjectFile } from "../model/project";

// doc/plan.md フェーズ12/§13: 複数タブの状態管理(doc/spec.md §4.1)の単体テスト。
describe("documentStore tabs", () => {
  beforeEach(() => {
    useDocumentStore.getState().newProject();
  });

  it("keeps each tab's content independent when switching between them", () => {
    const store = useDocumentStore.getState();
    const firstTabId = store.activeTabId;
    store.addShape(createShape("rect", { x: 0, y: 0 }, 0));
    expect(Object.keys(useDocumentStore.getState().document.shapes)).toHaveLength(1);

    const secondTabId = useDocumentStore.getState().addTab();
    expect(Object.keys(useDocumentStore.getState().document.shapes)).toHaveLength(0);
    useDocumentStore.getState().addShape(createShape("ellipse", { x: 10, y: 10 }, 0));
    expect(Object.keys(useDocumentStore.getState().document.shapes)).toHaveLength(1);
    expect(Object.values(useDocumentStore.getState().document.shapes)[0].type).toBe("ellipse");

    useDocumentStore.getState().switchTab(firstTabId);
    const restored = Object.values(useDocumentStore.getState().document.shapes);
    expect(restored).toHaveLength(1);
    expect(restored[0].type).toBe("rect");

    useDocumentStore.getState().switchTab(secondTabId);
    const secondAgain = Object.values(useDocumentStore.getState().document.shapes);
    expect(secondAgain).toHaveLength(1);
    expect(secondAgain[0].type).toBe("ellipse");
  });

  it("keeps Undo/Redo history independent per tab", () => {
    const store = useDocumentStore.getState();
    const firstTabId = store.activeTabId;
    store.addShape(createShape("rect", { x: 0, y: 0 }, 0));
    expect(useDocumentStore.getState().canUndo).toBe(true);

    const secondTabId = useDocumentStore.getState().addTab();
    expect(useDocumentStore.getState().canUndo).toBe(false);
    useDocumentStore.getState().addShape(createShape("ellipse", { x: 10, y: 10 }, 0));
    expect(useDocumentStore.getState().canUndo).toBe(true);

    // Undoing on tab 2 must not touch tab 1's content.
    useDocumentStore.getState().undo();
    expect(Object.keys(useDocumentStore.getState().document.shapes)).toHaveLength(0);

    useDocumentStore.getState().switchTab(firstTabId);
    expect(Object.keys(useDocumentStore.getState().document.shapes)).toHaveLength(1);
    expect(useDocumentStore.getState().canUndo).toBe(true);

    useDocumentStore.getState().undo();
    expect(Object.keys(useDocumentStore.getState().document.shapes)).toHaveLength(0);

    useDocumentStore.getState().switchTab(secondTabId);
    expect(useDocumentStore.getState().canRedo).toBe(true);
  });

  it("does nothing when closing the last remaining tab", () => {
    const store = useDocumentStore.getState();
    expect(store.tabs).toHaveLength(1);
    store.closeTab(store.activeTabId);
    expect(useDocumentStore.getState().tabs).toHaveLength(1);
  });

  it("activates a neighboring tab when the active tab is closed", () => {
    const store = useDocumentStore.getState();
    const firstTabId = store.activeTabId;
    const secondTabId = useDocumentStore.getState().addTab();
    const thirdTabId = useDocumentStore.getState().addTab();
    expect(useDocumentStore.getState().activeTabId).toBe(thirdTabId);

    useDocumentStore.getState().closeTab(thirdTabId);
    expect(useDocumentStore.getState().activeTabId).toBe(secondTabId);
    expect(useDocumentStore.getState().tabs.map((t) => t.id)).toEqual([firstTabId, secondTabId]);
  });

  it("renames and reorders tabs", () => {
    const store = useDocumentStore.getState();
    const firstTabId = store.activeTabId;
    const secondTabId = useDocumentStore.getState().addTab();

    useDocumentStore.getState().renameTab(firstTabId, "ガントチャート");
    expect(useDocumentStore.getState().tabs.find((t) => t.id === firstTabId)?.name).toBe("ガントチャート");

    useDocumentStore.getState().reorderTabs(secondTabId, firstTabId);
    expect(useDocumentStore.getState().tabs.map((t) => t.id)).toEqual([secondTabId, firstTabId]);
  });

  it("tracks isDirty across edits, tab operations, save, and project switches", () => {
    expect(useDocumentStore.getState().isDirty).toBe(false);

    useDocumentStore.getState().addShape(createShape("rect", { x: 0, y: 0 }, 0));
    expect(useDocumentStore.getState().isDirty).toBe(true);

    useDocumentStore.getState().markSaved();
    expect(useDocumentStore.getState().isDirty).toBe(false);

    useDocumentStore.getState().addTab();
    expect(useDocumentStore.getState().isDirty).toBe(true);

    useDocumentStore.getState().newProject();
    expect(useDocumentStore.getState().isDirty).toBe(false);

    useDocumentStore.getState().loadProject(createEmptyProjectFile(), "C:/tmp/test.qct");
    expect(useDocumentStore.getState().isDirty).toBe(false);
  });

  it("restores the tabs, order, names, and active tab saved via buildProjectFile", () => {
    const store = useDocumentStore.getState();
    const firstTabId = store.activeTabId;
    store.renameTab(firstTabId, "1枚目");
    const secondTabId = useDocumentStore.getState().addTab();
    useDocumentStore.getState().renameTab(secondTabId, "2枚目");
    useDocumentStore.getState().switchTab(firstTabId);

    const saved = useDocumentStore.getState().buildProjectFile();
    expect(saved.tabs.map((t) => t.name)).toEqual(["1枚目", "2枚目"]);
    expect(saved.activeTabId).toBe(firstTabId);

    useDocumentStore.getState().loadProject(saved, "C:/tmp/test.qct");
    const restored = useDocumentStore.getState();
    expect(restored.tabs.map((t) => t.name)).toEqual(["1枚目", "2枚目"]);
    expect(restored.activeTabId).toBe(firstTabId);
  });
});
