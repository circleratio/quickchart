import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Tool } from "../../core/model/shape";
import { TOOLS } from "./ToolPanel";

interface CommandPaletteProps {
  open: boolean;
  onSelectTool: (tool: Tool) => void;
  onClose: () => void;
}

// Ctrl+K (App.tsx) / the search icon in ToolPanel.tsx opens this (doc/spec.md
// §5.1). Reuses ToolPanel's own TOOLS list rather than keeping a second one,
// and is scoped to just those 7 tool-switching commands for the MVP (not a
// general app-wide command palette - see doc/requirement.md §9's resolved
// open question).
export function CommandPalette({ open, onSelectTool, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clears any leftover search text and re-focuses the input each time the
  // palette is (re)opened, rather than resuming the previous session's query.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setFocusedIndex(0);
    inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const filtered = TOOLS.filter((tool) => tool.label.toLowerCase().includes(query.toLowerCase()));

  function commit(index: number) {
    const tool = filtered[index];
    if (!tool) return;
    onSelectTool(tool.id);
    onClose();
  }

  // Arrow-key/Enter/Escape navigation lives on the input itself (not a
  // window-level listener) so it works regardless of App.tsx's global
  // shortcut guard, which deliberately ignores keystrokes while a text input
  // is focused (see App.tsx's handleKeyDown) - the same reasoning
  // StructuredTextPanel.tsx's own row inputs already follow for Tab/Enter.
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(focusedIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          type="text"
          placeholder="ツールを検索..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setFocusedIndex(0);
          }}
          onKeyDown={handleKeyDown}
        />
        {filtered.length === 0 ? (
          <p className="command-palette-empty">一致するツールがありません</p>
        ) : (
          <ul className="command-palette-list">
            {filtered.map((tool, i) => (
              <li key={tool.id}>
                <button
                  type="button"
                  className={i === focusedIndex ? "command-palette-item command-palette-item-focused" : "command-palette-item"}
                  onMouseEnter={() => setFocusedIndex(i)}
                  onClick={() => commit(i)}
                >
                  <tool.Icon />
                  <span>{tool.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
