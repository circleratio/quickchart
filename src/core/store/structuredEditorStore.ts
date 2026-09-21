import { create } from "zustand";

interface StructuredEditorState {
  // Which StructuredBlock's outline is currently shown in StructuredTextPanel.
  // UI-only state, not part of the document and not undoable, like
  // selectionStore (see doc/spec.md §4).
  activeBlockId: string | null;
  setActiveBlockId: (id: string | null) => void;
}

export const useStructuredEditorStore = create<StructuredEditorState>((set) => ({
  activeBlockId: null,
  setActiveBlockId: (id) => set({ activeBlockId: id }),
}));
