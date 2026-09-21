import { v4 as uuidv4 } from "uuid";
import type { OutlineNode } from "../model/document";

export interface ParsedBulletMatrix {
  columnHeaders: string[];
  outline: OutlineNode[];
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

interface RowSpec {
  placeholders: string[]; // this row's cell ids (e.g. "A1", "B1"), table column order
  node: OutlineNode;
}

// Parses a Markdown document shaped like doc/spec.md §6.2.4's example: a
// leading GFM table (row-header column + one column per data column, cells
// holding placeholder ids like "A1"/"B1"), followed by one "## <row header
// text>" section per row, each containing one "### <placeholder id>"
// subsection per cell, each holding a 2-level bullet list - a top-level
// "- **bold title**" line starts a new title group, an indented "  - detail"
// line appends a detail line to the group it follows. Anything that doesn't
// match this shape (a missing table, a "##"/"###" heading whose text doesn't
// match a table row/placeholder, a bullet line outside any "###" section) is
// silently skipped rather than erroring - same "ignore what doesn't parse"
// precedent as outlineParser.ts, since a hand-edited or slightly-off-shape
// paste shouldn't block the rest of the document from importing.
export function parseBulletMatrixMarkdown(text: string): ParsedBulletMatrix {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim().startsWith("|")) i++;
  if (i >= lines.length) return { columnHeaders: [], outline: [] };

  const columnHeaders = splitTableRow(lines[i]).slice(1);
  i++;
  if (i >= lines.length || !isSeparatorRow(splitTableRow(lines[i]))) return { columnHeaders: [], outline: [] };
  i++;

  const rows: RowSpec[] = [];
  while (i < lines.length && lines[i].trim().startsWith("|")) {
    const cells = splitTableRow(lines[i]);
    if (cells.length >= 2) {
      rows.push({
        placeholders: cells.slice(1),
        node: {
          id: uuidv4(),
          text: cells[0],
          children: columnHeaders.map(() => ({ id: uuidv4(), text: "", children: [] })),
        },
      });
    }
    i++;
  }

  let currentRow: RowSpec | undefined;
  let currentColumnIndex = -1;
  let currentTitle: OutlineNode | null = null;

  for (; i < lines.length; i++) {
    const line = lines[i];

    const rowHeading = /^##\s+(.+?)\s*$/.exec(line);
    if (rowHeading) {
      const text = rowHeading[1].trim();
      currentRow = rows.find((r) => r.node.text === text);
      currentColumnIndex = -1;
      currentTitle = null;
      continue;
    }

    const cellHeading = /^###\s+(.+?)\s*$/.exec(line);
    if (cellHeading) {
      const placeholder = cellHeading[1].trim();
      currentColumnIndex = currentRow ? currentRow.placeholders.indexOf(placeholder) : -1;
      currentTitle = null;
      continue;
    }

    const cell = currentRow?.node.children[currentColumnIndex];
    if (!cell) continue; // outside any recognized "###" cell section

    const titleLine = /^-\s+\*\*(.+?)\*\*\s*$/.exec(line);
    if (titleLine) {
      currentTitle = { id: uuidv4(), text: titleLine[1].trim(), children: [] };
      cell.children.push(currentTitle);
      continue;
    }

    const detailLine = /^\s+-\s+(.+?)\s*$/.exec(line);
    if (detailLine && currentTitle) {
      currentTitle.children.push({ id: uuidv4(), text: detailLine[1].trim(), children: [] });
    }
    // Blank lines, "---", and anything else are formatting-only - ignored.
  }

  return { columnHeaders, outline: rows.map((r) => r.node) };
}
