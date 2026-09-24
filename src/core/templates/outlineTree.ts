import type { OutlineNode } from "../model/document";

// Pure operations on an outline (OutlineNode tree) - no Document, shapes or
// pattern knowledge. Every function returns a new tree rather than mutating.

export function findNode(nodes: OutlineNode[], nodeId: string): OutlineNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const found = findNode(node.children, nodeId);
    if (found) return found;
  }
  return undefined;
}

export interface SiblingLocation {
  parentId: string | null;
  siblings: OutlineNode[];
  index: number;
}

export function getSiblingsAndIndex(nodes: OutlineNode[], nodeId: string, parentId: string | null = null): SiblingLocation | undefined {
  const index = nodes.findIndex((n) => n.id === nodeId);
  if (index !== -1) return { parentId, siblings: nodes, index };
  for (const node of nodes) {
    const found = getSiblingsAndIndex(node.children, nodeId, node.id);
    if (found) return found;
  }
  return undefined;
}

// Rebuilds the tree with `parentId`'s children array (or the root array, for
// parentId null) replaced by `updater(currentChildren)`.
export function updateChildren(nodes: OutlineNode[], parentId: string | null, updater: (children: OutlineNode[]) => OutlineNode[]): OutlineNode[] {
  if (parentId === null) return updater(nodes);
  return nodes.map((node) =>
    node.id === parentId
      ? { ...node, children: updater(node.children) }
      : { ...node, children: updateChildren(node.children, parentId, updater) },
  );
}

export function mapOutline(nodes: OutlineNode[], fn: (node: OutlineNode) => OutlineNode): OutlineNode[] {
  return nodes.map((node) => {
    const updated = fn(node);
    return { ...updated, children: mapOutline(updated.children, fn) };
  });
}

export function collectSubtreeIds(node: OutlineNode): string[] {
  return [node.id, ...node.children.flatMap(collectSubtreeIds)];
}

export function removeNodeFromTree(nodes: OutlineNode[], nodeId: string): OutlineNode[] {
  return nodes.filter((n) => n.id !== nodeId).map((n) => ({ ...n, children: removeNodeFromTree(n.children, nodeId) }));
}
