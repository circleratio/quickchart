import { describe, expect, it } from "vitest";
import { parseOutline } from "./outlineParser";
import { serializeOutline } from "./outlineSerializer";

describe("parseOutline", () => {
  it("returns an empty array for empty input", () => {
    expect(parseOutline("")).toEqual([]);
    expect(parseOutline("\n\n")).toEqual([]);
  });

  it("parses a single root node", () => {
    const nodes = parseOutline("- root");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("root");
    expect(nodes[0].children).toEqual([]);
    expect(typeof nodes[0].id).toBe("string");
    expect(nodes[0].id.length).toBeGreaterThan(0);
  });

  it("nests children under their parent by indentation (2 spaces per level)", () => {
    const nodes = parseOutline(["- root", "  - child1", "    - grandchild", "  - child2"].join("\n"));
    expect(nodes).toHaveLength(1);
    expect(nodes[0].children).toHaveLength(2);
    expect(nodes[0].children[0].text).toBe("child1");
    expect(nodes[0].children[0].children[0].text).toBe("grandchild");
    expect(nodes[0].children[1].text).toBe("child2");
  });

  it("treats a single tab as one indent level", () => {
    const nodes = parseOutline("- root\n\t- child");
    expect(nodes[0].children[0].text).toBe("child");
  });

  it("ignores lines that don't start with '- '", () => {
    const nodes = parseOutline(["not a bullet", "- root", "", "   "].join("\n"));
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("root");
  });

  it("clamps an over-indented first line to a root instead of crashing", () => {
    const nodes = parseOutline("    - surprise root");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("surprise root");
  });

  it("assigns a distinct id to every node, even with duplicate text", () => {
    const nodes = parseOutline("- same\n- same");
    expect(nodes[0].id).not.toBe(nodes[1].id);
  });
});

describe("serializeOutline / parseOutline round trip", () => {
  it("round-trips a multi-level outline's text (ids are not preserved, by design)", () => {
    const original = ["- root", "  - child1", "    - grandchild", "  - child2", "- root2"].join("\n");
    const parsed = parseOutline(original);
    expect(serializeOutline(parsed)).toBe(original);
  });
});
