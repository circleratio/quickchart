import { describe, expect, it } from "vitest";
import { DocumentHistory } from "./historyMiddleware";

interface Doc {
  count: number;
  items: string[];
}

describe("DocumentHistory", () => {
  it("undoes and redoes a sequence of edits back to matching snapshots", () => {
    const history = new DocumentHistory<Doc>();
    let state: Doc = { count: 0, items: [] };
    const snapshots: Doc[] = [state];

    state = history.apply(state, (d) => {
      d.count = 1;
      d.items.push("a");
    });
    snapshots.push(state);

    state = history.apply(state, (d) => {
      d.count = 2;
      d.items.push("b");
    });
    snapshots.push(state);

    state = history.apply(state, (d) => {
      d.count = 3;
      d.items.push("c");
    });
    snapshots.push(state);

    state = history.undo(state)!;
    expect(state).toEqual(snapshots[2]);
    state = history.undo(state)!;
    expect(state).toEqual(snapshots[1]);
    state = history.undo(state)!;
    expect(state).toEqual(snapshots[0]);
    expect(history.canUndo).toBe(false);
    expect(history.undo(state)).toBeNull();

    state = history.redo(state)!;
    expect(state).toEqual(snapshots[1]);
    state = history.redo(state)!;
    expect(state).toEqual(snapshots[2]);
    state = history.redo(state)!;
    expect(state).toEqual(snapshots[3]);
    expect(history.canRedo).toBe(false);
    expect(history.redo(state)).toBeNull();
  });

  it("clears the redo stack once a new edit is applied after an undo", () => {
    const history = new DocumentHistory<Doc>();
    let state: Doc = { count: 0, items: [] };
    state = history.apply(state, (d) => {
      d.count = 1;
    });
    state = history.apply(state, (d) => {
      d.count = 2;
    });
    state = history.undo(state)!;
    expect(history.canRedo).toBe(true);

    state = history.apply(state, (d) => {
      d.count = 99;
    });
    expect(history.canRedo).toBe(false);
    expect(state.count).toBe(99);
  });

  it("is a no-op (and records no history) when the recipe makes no change", () => {
    const history = new DocumentHistory<Doc>();
    const state: Doc = { count: 0, items: [] };
    const next = history.apply(state, () => {});
    expect(next).toBe(state);
    expect(history.canUndo).toBe(false);
  });

  it("commit() collapses a whole gesture's transient updates into a single undo step", () => {
    const history = new DocumentHistory<Doc>();
    const before: Doc = { count: 0, items: ["a"] };
    // Simulate many transient (non-history) updates during a drag gesture.
    let live = before;
    live = { ...live, count: 1 };
    live = { ...live, count: 2 };
    live = { ...live, count: 3 };

    history.commit(before, live);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);

    const undone = history.undo(live)!;
    expect(undone).toEqual(before);
    expect(history.undo(undone)).toBeNull(); // exactly one step was recorded

    const redone = history.redo(undone)!;
    expect(redone).toEqual(live);
  });

  it("commit() is a no-op when before and after are identical", () => {
    const history = new DocumentHistory<Doc>();
    const state: Doc = { count: 0, items: [] };
    history.commit(state, state);
    expect(history.canUndo).toBe(false);
  });
});
