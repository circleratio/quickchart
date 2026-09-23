import { beforeEach, describe, expect, it } from "vitest";
import { useDocumentStore } from "./documentStore";
import { useTabCloseStore } from "./tabCloseStore";
import { createShape } from "../model/shape";

// doc/plan.md フェーズ16/§13: タブを閉じる際の確認(doc/spec.md §5.2)。
describe("tabCloseStore", () => {
  beforeEach(() => {
    useDocumentStore.getState().newProject();
    useTabCloseStore.setState({ pendingTabId: null });
  });

  it("does nothing when only one tab is left", () => {
    const onlyTabId = useDocumentStore.getState().activeTabId;
    useDocumentStore.getState().addShape(createShape("rect", { x: 0, y: 0 }, 0));

    expect(useTabCloseStore.getState().requestCloseTab(onlyTabId)).toBe("ignored");
    expect(useTabCloseStore.getState().pendingTabId).toBeNull();
    expect(useDocumentStore.getState().tabs).toHaveLength(1);
  });

  it("closes an empty tab without asking", () => {
    const emptyTabId = useDocumentStore.getState().addTab();

    expect(useTabCloseStore.getState().requestCloseTab(emptyTabId)).toBe("closed");
    expect(useTabCloseStore.getState().pendingTabId).toBeNull();
    expect(useDocumentStore.getState().tabs.map((t) => t.id)).not.toContain(emptyTabId);
  });

  it("asks before closing a tab that has shapes, and keeps it on cancel", () => {
    const tabId = useDocumentStore.getState().addTab();
    useDocumentStore.getState().addShape(createShape("rect", { x: 0, y: 0 }, 0));

    expect(useTabCloseStore.getState().requestCloseTab(tabId)).toBe("pending");
    expect(useTabCloseStore.getState().pendingTabId).toBe(tabId);
    expect(useDocumentStore.getState().tabs).toHaveLength(2);

    expect(useTabCloseStore.getState().resolvePending("cancel")).toBe(false);
    expect(useTabCloseStore.getState().pendingTabId).toBeNull();
    expect(useDocumentStore.getState().tabs.map((t) => t.id)).toContain(tabId);
  });

  it("closes the pending tab when confirmed", () => {
    const tabId = useDocumentStore.getState().addTab();
    useDocumentStore.getState().addShape(createShape("rect", { x: 0, y: 0 }, 0));
    useTabCloseStore.getState().requestCloseTab(tabId);

    expect(useTabCloseStore.getState().resolvePending("close")).toBe(true);
    expect(useTabCloseStore.getState().pendingTabId).toBeNull();
    expect(useDocumentStore.getState().tabs.map((t) => t.id)).not.toContain(tabId);
  });
});
