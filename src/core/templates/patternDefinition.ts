import { v4 as uuidv4 } from "uuid";
import type { OutlineNode, StructuredBlock } from "../model/document";
import type { LayoutNode } from "./layoutNode";

export type PatternId = StructuredBlock["pattern"];
// StructuredBlock.params as stored - untyped, since it round-trips through
// project files; each pattern parses what it needs out of it.
export type RawParams = Record<string, unknown>;

// One field of a "fields" params editor.
export interface ParamField {
  key: string;
  label: string;
  placeholder?: string;
}

// A params editor shown above/below the outline in the structured text panel
// (StructuredTextPanel.tsx renders each kind). Every edit goes through
// sync.ts's updateBlockParams.
export type ParamEditor =
  // Free-text fields under one heading, each committed on blur (a title,
  // axis labels, column labels, ...).
  | { kind: "fields"; heading: string; fields: ParamField[]; placement?: "aboveOutline" | "belowOutline" }
  // A growable list of strings (column headers).
  | { kind: "list"; key: string; heading: string }
  // A radio choice among numbers (venn's set count).
  | { kind: "choice"; key: string; label: string; options: number[]; defaultValue: number };

// How the outline editor treats one node, by its position in the outline.
// Position-based children (a step's badge, a row's cells, ...) are locked in
// place so the generic editor can't shift the positions that give them their
// meaning.
export interface OutlineNodeRule {
  // Can't be moved up/down or deleted.
  fixed?: boolean;
  // Tab/Shift+Tab (indent/outdent) do nothing.
  noIndent?: boolean;
  // Enter doesn't add a sibling after it.
  noAddSibling?: boolean;
  // No "+子" (add child) button.
  noAddChild?: boolean;
  placeholder?: string;
  // Shown instead of a text input, for a node whose own text is unused.
  staticLabel?: string;
}

export interface OutlineNodeContext {
  depth: number;
  // Index among its siblings.
  index: number;
  // Index of the root (depth-0) node this node sits under.
  rootIndex: number;
}

// Everything the rest of the app needs to know about one pattern, so adding a
// pattern means writing its layout file and registering it (registry.ts)
// rather than threading its id through sync.ts's edit operations and the
// structured text panel.
export interface PatternDefinition {
  // Display name (pattern library, structured text panel header).
  label: string;

  // Lays out the whole block from its outline and stored params.
  layout(outline: OutlineNode[], params: RawParams): LayoutNode[];

  // Set when the layout can produce negative coordinates (centered geometry,
  // headers placed above row 0, ...): sync.ts then shifts it so its bounding
  // box starts at (0, 0), which every caller assumes (see normalizeToOrigin).
  normalizeOrigin?: boolean;

  // Set for the tree patterns (pyramid/logicTree), whose positions don't
  // depend on the outline as a whole: adding/deleting a node places or
  // removes just that node's shape next to a reference shape (keeping every
  // other shape's manual position/style), and parent-child connector lines
  // are redrawn from the shapes' actual positions after every structural
  // edit. `direction` is the tree's growth axis ("down": roots on top,
  // "right": roots on the left). Every other pattern regenerates all of its
  // shapes from scratch on add/delete.
  tree?: { direction: "down" | "right" };

  // How indent/outdent/move re-places shapes. "relayout" moves the existing
  // shapes (matched by outline node id) to their freshly laid-out positions,
  // keeping their ids and styling - only correct when nothing else changes:
  // no untracked shape (`nodeIds: []`) depends on node order, no shape's own
  // size/style depends on its index, and no node can drop out of the layout
  // by being nested. "regenerate" rebuilds every shape from scratch.
  restructure: "relayout" | "regenerate";

  // Set when a node's text determines layout, not just the text of its own
  // shape, so a text edit must regenerate the block instead of patching the
  // shape in place. "panel": only outline-panel edits can reach such nodes
  // (they have no shape of their own to edit on the canvas); "panelAndCanvas":
  // canvas edits too.
  regenerateOnTextEdit?: "panel" | "panelAndCanvas";

  // Outline of a freshly created block's first edit, for patterns whose
  // outline has a fixed top-level shape (all roots come in at once).
  initialOutline?(params: RawParams): OutlineNode[];
  // A new root node, prefilled with the position-based children the
  // pattern expects (e.g. one cell per column), so the generic outline
  // editor never produces a root missing them. Defaults to an empty node.
  newRoot?(params: RawParams): OutlineNode;
  // A new child of `parentNodeId`, prefilled the same way; undefined falls
  // back to an empty node.
  newChild?(outline: OutlineNode[], parentNodeId: string, params: RawParams): OutlineNode | undefined;

  // Adjusts a params update (sync.ts's updateBlockParams) before the block
  // is regenerated: normalizes the merged params and reshapes the outline to
  // match them (e.g. one cell per column when the columns change). `patch`
  // is what the caller changed, so a pattern can react only to the keys it
  // cares about. Omitted: the merged params are stored as-is.
  onParamsChange?(outline: OutlineNode[], params: RawParams, patch: RawParams): { outline: OutlineNode[]; params: RawParams };

  // --- Structured text panel ---

  // Params as the pattern reads them (defaults, legacy fallbacks), for
  // showing their current values in paramEditors. Omitted: stored as-is.
  readParams?(params: RawParams): RawParams;
  paramEditors?: ParamEditor[];
  // Max root count; the editor stops adding roots there. Omitted: no limit.
  rootLimit?(params: RawParams): number;
  // Shown once rootLimit is reached.
  rootLimitNote?: string;
  // Parses the bulk-import text into an outline (plus any params the text
  // carries). Omitted: the plain "- item" outline syntax (outlineParser.ts).
  importText?(text: string): { outline: OutlineNode[]; params?: RawParams };
  importPlaceholder?: string;
  // Set for a pattern whose outline needs a dedicated editor instead of the
  // generic tree (StructuredTextPanel.tsx picks it by this name).
  customEditor?: "schedule";
  nodeRule?(context: OutlineNodeContext): OutlineNodeRule;
}

// The single-field title editor shared by every pattern with a
// params.title.
export const TITLE_EDITOR: ParamEditor = { kind: "fields", heading: "タイトル", fields: [{ key: "title", label: "見出し" }] };

// Rule for a position-based child whose own text is a leaf value: locked in
// place, with nothing to add around or under it.
export const LOCKED_LEAF: OutlineNodeRule = { fixed: true, noIndent: true, noAddSibling: true, noAddChild: true };

export function emptyNode(children: OutlineNode[] = []): OutlineNode {
  return { id: uuidv4(), text: "", children };
}

// `count` empty leaf nodes - prefilled position-based children.
export function emptyNodes(count: number): OutlineNode[] {
  return Array.from({ length: count }, () => emptyNode());
}

export function stringParam(params: RawParams, key: string): string {
  const raw = params[key];
  return typeof raw === "string" ? raw : "";
}

export function stringListParam(params: RawParams, key: string): string[] {
  const raw = params[key];
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string") : [];
}
