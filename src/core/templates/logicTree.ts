import type { OutlineNode } from "../model/document";
import { layoutTree } from "./treeLayout";
import type { LayoutNode } from "./treeLayout";

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
const GAP = 24;

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
