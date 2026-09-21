import { create } from "zustand";
import type { ShapeId } from "../model/shape";
import type { ShapeStyle } from "../model/style";

interface SelectionState {
  selectedShapeIds: ShapeId[];
  select: (id: ShapeId | null) => void;
  selectMany: (ids: ShapeId[]) => void;
  toggle: (id: ShapeId) => void;
  clear: () => void;
  // "Format painter" (書式のコピペ, see doc/spec.md §7): a clipboard-like slot for
  // one shape's style, independent of Undo/Redo like the rest of this store.
  copiedStyle: ShapeStyle | null;
  copyStyle: (style: ShapeStyle) => void;
  // Which text shape's content is being edited in place on the canvas (Phase 7
  // gap-fill). Lives here rather than as local Canvas.tsx state so other
  // components (PropertyPanel's explicit "edit" button) can trigger it too.
  editingShapeId: ShapeId | null;
  setEditingShapeId: (id: ShapeId | null) => void;
}

// Excluded from Undo/Redo history by design (see doc/spec.md §4).
export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedShapeIds: [],
  select: (id) => set({ selectedShapeIds: id ? [id] : [] }),
  selectMany: (ids) => set({ selectedShapeIds: ids }),
  toggle: (id) => {
    const current = get().selectedShapeIds;
    set({
      selectedShapeIds: current.includes(id)
        ? current.filter((sid) => sid !== id)
        : [...current, id],
    });
  },
  clear: () => set({ selectedShapeIds: [] }),

  copiedStyle: null,
  copyStyle: (style) => set({ copiedStyle: style }),

  editingShapeId: null,
  setEditingShapeId: (id) => set({ editingShapeId: id }),
}));
