import type { OutlineNode } from "../model/document";
import { layoutTree } from "./treeLayout";
import type { LayoutNode } from "./treeLayout";

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
const GAP = 24;

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
