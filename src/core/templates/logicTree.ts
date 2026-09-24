import type { OutlineNode } from "../model/document";
import { layoutTree } from "./treeLayout";
import type { LayoutNode } from "./layoutNode";
import type { PatternDefinition } from "./patternDefinition";

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
// 1.5x the original value - ロジックツリー's blocks read better with more
// breathing room (matches pyramid.ts's own GAP getting the same 1.5x).
const GAP = 36;

// Logic tree (ロジックツリー): the outline maps directly onto a tree, root(s)
// at the left edge, children extending rightward (doc/spec.md §6.2).
export function layoutLogicTree(outline: OutlineNode[]): LayoutNode[] {
  return layoutTree(outline, {
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    depthGap: GAP,
    siblingGap: GAP,
    direction: "right",
  });
}

// ロジックツリー (doc/spec.md §6.2).
export const logicTreePattern: PatternDefinition = {
  layout: (outline) => layoutLogicTree(outline),
  tree: { direction: "right" },
  restructure: "relayout",
};
