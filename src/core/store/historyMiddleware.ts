import { applyPatches, enablePatches, produceWithPatches } from "immer";
import type { Patch } from "immer";

enablePatches();

interface HistoryEntry {
  patches: Patch[];
  inversePatches: Patch[];
}

/**
 * Patch-based Undo/Redo for a single piece of state (see doc/spec.md §4).
 * `apply` runs an Immer recipe and records one undo step per call, so a
 * multi-field change (e.g. regenerating a structured template's shapes) can be
 * grouped into a single undoable operation by doing it inside one recipe.
 */
export class DocumentHistory<T extends object> {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  apply(state: T, recipe: (draft: T) => void): T {
    const [next, patches, inversePatches] = produceWithPatches(state, recipe);
    if (patches.length === 0) return state;
    this.undoStack.push({ patches, inversePatches });
    this.redoStack = [];
    return next;
  }

  // Records a single undo step for the transition from `before` to `after`,
  // regardless of how many transient (non-history) updates happened in between.
  // Used to collapse a whole pointer gesture (drag/resize/rotate - many
  // intermediate updates) into one undoable operation instead of one per event.
  commit(before: T, after: T): void {
    if (before === after) return;
    const [, patches, inversePatches] = produceWithPatches(before, (draft) => {
      Object.assign(draft, after);
    });
    if (patches.length === 0) return;
    this.undoStack.push({ patches, inversePatches });
    this.redoStack = [];
  }

  undo(state: T): T | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push(entry);
    return applyPatches(state, entry.inversePatches) as T;
  }

  redo(state: T): T | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push(entry);
    return applyPatches(state, entry.patches) as T;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
