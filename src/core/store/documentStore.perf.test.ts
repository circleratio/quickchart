import { describe, expect, it } from "vitest";
import { useDocumentStore } from "./documentStore";
import { createShape } from "../model/shape";

// Not a strict benchmark (doc/spec.md §12 deliberately sets no numeric
// target) - just a smoke test that catches a catastrophic regression (e.g.
// an accidental O(n^2) path) at the "tens to ~100 shapes" scale spec.md
// describes, without being a flaky micro-benchmark. Real "does it feel
// responsive" needs a human in the running app.
describe("documentStore at ~100-shape scale", () => {
  it("adds, moves, and duplicates 100 shapes without errors or pathological slowdown", () => {
    const store = useDocumentStore.getState();
    const start = performance.now();

    const ids: string[] = [];
    for (let i = 0; i < 100; i++) {
      const shape = createShape("rect", { x: i * 10, y: i * 5 }, i);
      store.addShape(shape);
      ids.push(shape.id);
    }
    expect(Object.keys(useDocumentStore.getState().document.shapes)).toHaveLength(100);

    for (const id of ids) {
      store.moveShape(id, 1, 1);
    }

    const duplicated = store.duplicateShapes(ids.slice(0, 20));
    expect(duplicated).toHaveLength(20);
    expect(Object.keys(useDocumentStore.getState().document.shapes)).toHaveLength(120);

    const elapsedMs = performance.now() - start;
    // Generous budget - this is a regression tripwire, not a target.
    expect(elapsedMs).toBeLessThan(2000);
  });
});
