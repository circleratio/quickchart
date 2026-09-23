import { describe, expect, it } from "vitest";
import { deserializeProjectFile, serializeProjectFile } from "./projectFile";
import { createEmptyDocument } from "../model/document";
import { createEmptyProjectFile } from "../model/project";

describe("projectFile", () => {
  it("round-trips a current-format ProjectFile unchanged", () => {
    const file = createEmptyProjectFile();
    const restored = deserializeProjectFile(serializeProjectFile(file));
    expect(restored).toEqual(file);
  });

  it("wraps a legacy single-Document file (no `tabs` field) as a single tab", () => {
    const legacyDoc = createEmptyDocument();
    legacyDoc.shapes["abc"] = {
      id: "abc",
      type: "rect",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      rotation: 0,
      style: { fill: "#fff", stroke: "#000", strokeWidth: 1 } as never,
      zIndex: 0,
    };
    const legacyRaw = { ...legacyDoc, formatVersion: 1 };

    const migrated = deserializeProjectFile(legacyRaw);

    expect(migrated.tabs).toHaveLength(1);
    expect(migrated.activeTabId).toBe(migrated.tabs[0].id);
    expect(migrated.tabs[0].document.shapes).toEqual(legacyDoc.shapes);
    expect(migrated.tabs[0].document.layers).toEqual(legacyDoc.layers);
    expect((migrated.tabs[0].document as unknown as { formatVersion?: number }).formatVersion).toBeUndefined();
  });
});
