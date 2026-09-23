import { create } from "zustand";
import { useDocumentStore } from "./documentStore";

// What a close request did right away: "closed" (empty tab, no confirmation
// needed), "pending" (confirmation dialog opened), or "ignored" (last tab).
export type TabCloseRequestResult = "closed" | "pending" | "ignored";

interface TabCloseState {
  // Tab awaiting the "close this tab?" confirmation; null when no dialog is open.
  pendingTabId: string | null;
  requestCloseTab: (id: string) => TabCloseRequestResult;
  // Returns whether the pending tab was actually closed.
  resolvePending: (choice: "close" | "cancel") => boolean;
}

// Closing a tab discards it together with its Undo history, so a tab that has
// any shapes is confirmed first (doc/requirement.md §4.7, doc/spec.md §5.2).
// Lives in a store rather than component state because both TabBar's close
// button and App's Ctrl+W need to open the same dialog.
export const useTabCloseStore = create<TabCloseState>((set, get) => ({
  pendingTabId: null,

  requestCloseTab: (id) => {
    const { tabs, closeTab } = useDocumentStore.getState();
    if (tabs.length <= 1) return "ignored";
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return "ignored";
    if (Object.keys(tab.document.shapes).length === 0) {
      closeTab(id);
      return "closed";
    }
    set({ pendingTabId: id });
    return "pending";
  },

  resolvePending: (choice) => {
    const id = get().pendingTabId;
    set({ pendingTabId: null });
    if (id === null || choice !== "close") return false;
    const before = useDocumentStore.getState().tabs.length;
    useDocumentStore.getState().closeTab(id);
    return useDocumentStore.getState().tabs.length < before;
  },
}));
