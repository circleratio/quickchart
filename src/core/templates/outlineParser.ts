import { v4 as uuidv4 } from "uuid";
import type { OutlineNode } from "../model/document";

const INDENT_UNIT_SPACES = 2;

interface ParsedLine {
  depth: number;
  text: string;
}

function normalizeLine(line: string): ParsedLine | null {
  // Normalize leading tabs to INDENT_UNIT_SPACES spaces each so indentation
  // measurement (below) doesn't need to special-case tabs vs spaces.
  const expanded = line.replace(/^\t+/, (tabs) => " ".repeat(tabs.length * INDENT_UNIT_SPACES));
  const match = expanded.match(/^( *)-\s?(.*)$/);
  if (!match) return null; // lines not starting with "- " are ignored (doc/spec.md §6.1)
  const [, indent, text] = match;
  return { depth: Math.floor(indent.length / INDENT_UNIT_SPACES), text: text.trim() };
}

// Parses a pasted/imported outline into a fresh tree with brand-new nodeIds
// (used for the "bulk import" path only - see doc/spec.md §6.1; the
// structured editor's own add/indent/delete operations assign nodeIds
// directly and never go through this parser).
export function parseOutline(text: string): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = []; // stack[i] = the current node at depth i

  for (const rawLine of text.split(/\r?\n/)) {
    const parsed = normalizeLine(rawLine);
    if (!parsed) continue;

    const node: OutlineNode = { id: uuidv4(), text: parsed.text, children: [] };
    const depth = Math.min(parsed.depth, stack.length); // clamp over-indented lines
    stack.length = depth;

    if (depth === 0) {
      roots.push(node);
    } else {
      stack[depth - 1].children.push(node);
    }
    stack[depth] = node;
  }

  return roots;
}
