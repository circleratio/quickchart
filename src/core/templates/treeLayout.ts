import type { OutlineNode } from "../model/document";
import type { LayoutNode } from "./layoutNode";

export interface TreeLayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  depthGap: number;
  siblingGap: number;
  // "down" = roots at top, children below (pyramid); "right" = roots at left,
  // children extend rightward (logic tree). See doc/spec.md §6.2.
  direction: "down" | "right";
}

// Simple leaf-count-based tree layout: each leaf gets one "slot" along the
// spread axis, and each parent is centered over the span of its children.
export function layoutTree(outline: OutlineNode[], options: TreeLayoutOptions): LayoutNode[] {
  const { nodeWidth, nodeHeight, depthGap, siblingGap, direction } = options;
  const spreadSize = direction === "down" ? nodeWidth : nodeHeight;
  const depthStep = (direction === "down" ? nodeHeight : nodeWidth) + depthGap;
  const result: LayoutNode[] = [];
  let cursor = 0;

  function place(node: OutlineNode, depth: number): number {
    const depthPos = depth * depthStep;
    let spreadPos: number;

    if (node.children.length === 0) {
      spreadPos = cursor;
      cursor += spreadSize + siblingGap;
    } else {
      const centers = node.children.map((child) => place(child, depth + 1));
      spreadPos = (centers[0] + centers[centers.length - 1]) / 2 - spreadSize / 2;
    }

    result.push({
      nodeIds: [node.id],
      text: node.text,
      depth,
      x: direction === "down" ? spreadPos : depthPos,
      y: direction === "down" ? depthPos : spreadPos,
      width: nodeWidth,
      height: nodeHeight,
    });
    return spreadPos + spreadSize / 2;
  }

  for (const root of outline) place(root, 0);
  return result;
}
