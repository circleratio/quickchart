import { create } from "zustand";

interface StructuredEditorState {
  // Which StructuredBlock's outline is currently shown in StructuredTextPanel.
  // UI-only state, not part of the document and not undoable, like
  // selectionStore (see doc/spec.md §4).
  activeBlockId: string | null;
  setActiveBlockId: (id: string | null) => void;
  // Set right after a new outline node is added (e.g. pressing Enter to add a
  // sibling), naming the node whose row should receive input focus once it
  // renders. The row that matches it focuses itself and clears this back to
  // null (StructuredTextPanel.tsx) - a one-shot signal, not a normal
  // selection, so it's kept separate from activeBlockId.
  pendingFocusNodeId: string | null;
  setPendingFocusNodeId: (id: string | null) => void;
}

export const useStructuredEditorStore = create<StructuredEditorState>((set) => ({
  activeBlockId: null,
  setActiveBlockId: (id) => set({ activeBlockId: id }),
  pendingFocusNodeId: null,
  setPendingFocusNodeId: (id) => set({ pendingFocusNodeId: id }),
}));
