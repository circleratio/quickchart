import type { OutlineNode } from "../model/document";
import { layoutTree } from "./treeLayout";
import type { LayoutNode } from "./layoutNode";
import type { PatternDefinition } from "./patternDefinition";

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
// 1.5x logicTree.ts's own (otherwise-identical) GAP - ツリー図's blocks read
// better with more breathing room than a generic tree layout's default.
const GAP = 36;

// Pyramid structure (ピラミッドストラクチャー): the outline maps directly onto
// a tree, root(s) at the top row, children in rows below (doc/spec.md §6.2).
export function layoutPyramid(outline: OutlineNode[]): LayoutNode[] {
  return layoutTree(outline, {
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    depthGap: GAP,
    siblingGap: GAP,
    direction: "down",
  });
}

// ツリー図 (doc/spec.md §6.2).
export const pyramidPattern: PatternDefinition = {
  label: "ツリー図",
  layout: (outline) => layoutPyramid(outline),
  tree: { direction: "down" },
  restructure: "relayout",
};
