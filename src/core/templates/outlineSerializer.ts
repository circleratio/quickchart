import type { OutlineNode } from "../model/document";

const INDENT = "  "; // 2 spaces, matching outlineParser.ts's normalized unit

function serializeNode(node: OutlineNode, depth: number, lines: string[]): void {
  lines.push(`${INDENT.repeat(depth)}- ${node.text}`);
  for (const child of node.children) serializeNode(child, depth + 1, lines);
}

// Inverse of outlineParser.ts's parseOutline, for copying a block's outline
// back out as plain text (doc/spec.md §6.1).
export function serializeOutline(nodes: OutlineNode[]): string {
  const lines: string[] = [];
  for (const node of nodes) serializeNode(node, 0, lines);
  return lines.join("\n");
}
