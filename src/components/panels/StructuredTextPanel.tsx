import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useDocumentStore } from "../../core/store/documentStore";
import { useSelectionStore } from "../../core/store/selectionStore";
import { useStructuredEditorStore } from "../../core/store/structuredEditorStore";
import { parseOutline } from "../../core/templates/outlineParser";
import { parseBulletMatrixMarkdown } from "../../core/templates/bulletMatrixParser";
import { MATRIX_MAX_ROOTS } from "../../core/templates/matrix";
import { VENN_MAX_SETS, VENN_MIN_SETS } from "../../core/templates/venn";
import type { OutlineNode, StructuredBlock } from "../../core/model/document";

const PATTERN_LABEL: Record<StructuredBlock["pattern"], string> = {
  pyramid: "ピラミッド",
  logicTree: "ロジックツリー",
  matrix: "マトリクス",
  venn: "ベン図",
  headingBullets: "見出し付き箇条書き",
  bulletMatrix: "箇条書きマトリクス",
};

const BULLET_MATRIX_IMPORT_PLACEHOLDER =
  "| 施策領域 | 列見出し1 | 列見出し2 |\n" +
  "|---|---|---|\n" +
  "| 行1 | A1 | B1 |\n\n" +
  "## 行1\n\n" +
  "### A1\n\n" +
  "- **タイトル**\n" +
  "  - 詳細\n\n" +
  "### B1\n\n" +
  "- **タイトル**\n" +
  "  - 詳細";

function bulletMatrixColumnHeaders(params: Record<string, unknown>): string[] {
  const raw = params.columnHeaders;
  return Array.isArray(raw) ? raw.filter((h): h is string => typeof h === "string") : [];
}

// Matrix is fixed at 4 quadrants; Venn's root count follows params.setCount
// (2-3). Other patterns have no root limit. See doc/spec.md §6.2.1/§6.2.2 -
// the UI is expected to prevent exceeding these, with matrix.ts/venn.ts's own
// layout functions ignoring any excess as a defensive backstop.
function rootLimitFor(block: StructuredBlock): number {
  if (block.pattern === "matrix") return MATRIX_MAX_ROOTS;
  if (block.pattern === "venn") {
    const raw = block.params.setCount;
    return typeof raw === "number" ? raw : VENN_MAX_SETS;
  }
  return Infinity;
}

export function StructuredTextPanel() {
  const document = useDocumentStore((s) => s.document);
  const addFirstOutlineNode = useDocumentStore((s) => s.addFirstOutlineNode);
  const replaceOutline = useDocumentStore((s) => s.replaceOutline);
  const updateMatrixAxisLabels = useDocumentStore((s) => s.updateMatrixAxisLabels);
  const updateVennSetCount = useDocumentStore((s) => s.updateVennSetCount);
  const updateBulletMatrixColumns = useDocumentStore((s) => s.updateBulletMatrixColumns);
  const replaceBulletMatrix = useDocumentStore((s) => s.replaceBulletMatrix);

  const activeBlockId = useStructuredEditorStore((s) => s.activeBlockId);
  const setActiveBlockId = useStructuredEditorStore((s) => s.setActiveBlockId);
  const selectedShapeIds = useSelectionStore((s) => s.selectedShapeIds);

  // Selecting a shape that belongs to a structured block switches the panel to
  // that block, so clicking a generated shape on canvas is enough to edit its
  // outline - no separate "which block" picker needed. `templateNodeIds`
  // being set (even to []) is what marks a shape as template-generated - see
  // ShapeRenderer.tsx's isTemplateNode for why this can't be a `.length`
  // check (bulletMatrix's column headers are template shapes with no linked
  // outline node, so their own `templateNodeIds` is always []).
  useEffect(() => {
    if (selectedShapeIds.length !== 1) return;
    const shape = document.shapes[selectedShapeIds[0]];
    if (shape?.templateNodeIds === undefined) return;
    const block = document.structuredBlocks.find((b) => b.generatedShapeIds.includes(selectedShapeIds[0]));
    if (block) setActiveBlockId(block.id);
  }, [selectedShapeIds, document.shapes, document.structuredBlocks, setActiveBlockId]);

  const block = activeBlockId ? document.structuredBlocks.find((b) => b.id === activeBlockId) : undefined;
  if (!block) return null;

  const rootLimit = rootLimitFor(block);
  const atRootLimit = block.outline.length >= rootLimit;

  return (
    <div className="structured-text-panel">
      <div className="structured-text-panel-header">
        <h3>階層テキスト({PATTERN_LABEL[block.pattern]})</h3>
        <button type="button" onClick={() => setActiveBlockId(null)}>
          閉じる
        </button>
      </div>

      {block.pattern === "venn" && (
        <VennSetCountControl
          value={typeof block.params.setCount === "number" ? block.params.setCount : VENN_MAX_SETS}
          onChange={(n) => updateVennSetCount(block.id, n)}
        />
      )}

      {block.pattern === "bulletMatrix" && (
        <BulletMatrixColumnInputs
          key={block.id}
          columnHeaders={bulletMatrixColumnHeaders(block.params)}
          onCommit={(headers) => updateBulletMatrixColumns(block.id, headers)}
        />
      )}

      {block.outline.length === 0 ? (
        <button type="button" onClick={() => addFirstOutlineNode(block.id)}>
          + 最初の項目を追加
        </button>
      ) : (
        <div className="outline-tree">
          {block.outline.map((node) => (
            <OutlineRow
              key={node.id}
              node={node}
              blockId={block.id}
              depth={0}
              disableAddSibling={atRootLimit}
              pattern={block.pattern}
            />
          ))}
        </div>
      )}
      {block.outline.length > 0 && atRootLimit && (
        <p className="outline-limit-note">
          {block.pattern === "matrix" ? "マトリクスは4象限までです。" : "設定した集合数までです。"}
        </p>
      )}

      {block.pattern === "matrix" && (
        <MatrixAxisLabelInputs
          key={block.id}
          axisXLabel={typeof block.params.axisXLabel === "string" ? block.params.axisXLabel : ""}
          axisYLabel={typeof block.params.axisYLabel === "string" ? block.params.axisYLabel : ""}
          onCommit={(axisParams) => updateMatrixAxisLabels(block.id, axisParams)}
        />
      )}

      {block.pattern === "bulletMatrix" ? (
        <ImportSection
          placeholder={BULLET_MATRIX_IMPORT_PLACEHOLDER}
          onImport={(text) => {
            const parsed = parseBulletMatrixMarkdown(text);
            replaceBulletMatrix(block.id, parsed.columnHeaders, parsed.outline);
          }}
        />
      ) : (
        <ImportSection onImport={(text) => replaceOutline(block.id, parseOutline(text))} />
      )}
    </div>
  );
}

function VennSetCountControl({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="venn-set-count">
      <span>集合数</span>
      {Array.from({ length: VENN_MAX_SETS - VENN_MIN_SETS + 1 }, (_, i) => VENN_MIN_SETS + i).map((n) => (
        <label key={n}>
          <input type="radio" name="venn-set-count" checked={value === n} onChange={() => onChange(n)} />
          {n}
        </label>
      ))}
    </div>
  );
}

function MatrixAxisLabelInputs({
  axisXLabel,
  axisYLabel,
  onCommit,
}: {
  axisXLabel: string;
  axisYLabel: string;
  onCommit: (params: { axisXLabel?: string; axisYLabel?: string }) => void;
}) {
  const [x, setX] = useState(axisXLabel);
  const [y, setY] = useState(axisYLabel);

  return (
    <div className="matrix-axis-labels">
      <h4>軸ラベル</h4>
      <label>
        横軸
        <input value={x} onChange={(e) => setX(e.target.value)} onBlur={() => onCommit({ axisXLabel: x })} />
      </label>
      <label>
        縦軸
        <input value={y} onChange={(e) => setY(e.target.value)} onBlur={() => onCommit({ axisYLabel: y })} />
      </label>
    </div>
  );
}

// bulletMatrix's column headers (doc/spec.md §6.2.4) - a dynamic list rather
// than MatrixAxisLabelInputs' fixed pair, since a bullet matrix can have any
// number of columns. Adding/removing a column commits immediately (it
// resizes every row's cells right away - see updateBulletMatrixColumns in
// sync.ts); renaming one commits on blur, matching MatrixAxisLabelInputs.
function BulletMatrixColumnInputs({
  columnHeaders,
  onCommit,
}: {
  columnHeaders: string[];
  onCommit: (columnHeaders: string[]) => void;
}) {
  const [headers, setHeaders] = useState(columnHeaders);

  return (
    <div className="bullet-matrix-columns">
      <h4>列見出し</h4>
      {headers.map((header, i) => (
        <div className="bullet-matrix-column-row" key={i}>
          <input
            value={header}
            onChange={(e) => setHeaders((prev) => prev.map((h, j) => (j === i ? e.target.value : h)))}
            onBlur={() => onCommit(headers)}
          />
          <button
            type="button"
            title="この列を削除"
            onClick={() => {
              const next = headers.filter((_, j) => j !== i);
              setHeaders(next);
              onCommit(next);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const next = [...headers, ""];
          setHeaders(next);
          onCommit(next);
        }}
      >
        + 列を追加
      </button>
    </div>
  );
}

// Finds the id of the node immediately following `afterId` among its own
// siblings - used right after addOutlineSibling to identify the row it just
// created (that action doesn't return the new node's id itself), so focus
// can be moved there. Returns null if `afterId` has no next sibling (it
// shouldn't, right after adding one) or isn't found at all.
function findNextSiblingId(nodes: OutlineNode[], afterId: string): string | null {
  const index = nodes.findIndex((n) => n.id === afterId);
  if (index !== -1) return nodes[index + 1]?.id ?? null;
  for (const n of nodes) {
    const found = findNextSiblingId(n.children, afterId);
    if (found) return found;
  }
  return null;
}

function OutlineRow({
  node,
  blockId,
  depth,
  disableAddSibling,
  pattern,
}: {
  node: OutlineNode;
  blockId: string;
  depth: number;
  disableAddSibling?: boolean;
  pattern: StructuredBlock["pattern"];
}) {
  const updateOutlineNodeText = useDocumentStore((s) => s.updateOutlineNodeText);
  const addOutlineChild = useDocumentStore((s) => s.addOutlineChild);
  const addOutlineSibling = useDocumentStore((s) => s.addOutlineSibling);
  const deleteOutlineNode = useDocumentStore((s) => s.deleteOutlineNode);
  const indentOutlineNode = useDocumentStore((s) => s.indentOutlineNode);
  const outdentOutlineNode = useDocumentStore((s) => s.outdentOutlineNode);
  const moveOutlineNode = useDocumentStore((s) => s.moveOutlineNode);
  const pendingFocusNodeId = useStructuredEditorStore((s) => s.pendingFocusNodeId);
  const setPendingFocusNodeId = useStructuredEditorStore((s) => s.setPendingFocusNodeId);

  const inputRef = useRef<HTMLInputElement>(null);

  // Claims and clears the pending-focus signal once this is the row it names
  // (set below, right after Enter adds this row as a new sibling) - by the
  // time this effect runs, the new row has mounted and can actually receive
  // focus, which calling .focus() synchronously in the keydown handler could
  // not do.
  useEffect(() => {
    if (pendingFocusNodeId !== node.id) return;
    inputRef.current?.focus();
    setPendingFocusNodeId(null);
  }, [pendingFocusNodeId, node.id, setPendingFocusNodeId]);

  // bulletMatrix's depth-1 nodes are cells, position-aligned with
  // params.columnHeaders rather than by their own text (see bulletMatrix.ts) -
  // that text is never read by the layout, and the cell itself is neither
  // reorderable nor deletable on its own (its position IS its column;
  // removing/adding columns goes through BulletMatrixColumnInputs instead).
  // Only its title/detail children (added via "+子") are real content.
  const isBulletMatrixCell = pattern === "bulletMatrix" && depth === 1;

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) outdentOutlineNode(blockId, node.id);
      else indentOutlineNode(blockId, node.id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (disableAddSibling) return;
      addOutlineSibling(blockId, node.id);
      const block = useDocumentStore.getState().document.structuredBlocks.find((b) => b.id === blockId);
      const newNodeId = block ? findNextSiblingId(block.outline, node.id) : null;
      if (newNodeId) setPendingFocusNodeId(newNodeId);
    }
  }

  return (
    <div className="outline-node">
      <div className="outline-row" style={{ paddingLeft: depth * 16 }}>
        {isBulletMatrixCell ? (
          <span className="outline-row-static-label">セル({"+子"}でタイトルを追加)</span>
        ) : (
          <input
            ref={inputRef}
            value={node.text}
            placeholder="項目を入力"
            onChange={(e) => updateOutlineNodeText(blockId, node.id, e.target.value)}
            onKeyDown={handleKeyDown}
          />
        )}
        {!isBulletMatrixCell && (
          <>
            <button type="button" title="上へ移動" onClick={() => moveOutlineNode(blockId, node.id, "up")}>
              ↑
            </button>
            <button type="button" title="下へ移動" onClick={() => moveOutlineNode(blockId, node.id, "down")}>
              ↓
            </button>
          </>
        )}
        <button type="button" title="子を追加" onClick={() => addOutlineChild(blockId, node.id)}>
          +子
        </button>
        {!isBulletMatrixCell && (
          <button type="button" title="削除" onClick={() => deleteOutlineNode(blockId, node.id)}>
            ×
          </button>
        )}
      </div>
      {node.children.map((child) => (
        <OutlineRow key={child.id} node={child} blockId={blockId} depth={depth + 1} pattern={pattern} />
      ))}
    </div>
  );
}

function ImportSection({
  onImport,
  placeholder = "- 親項目\n  - 子項目",
}: {
  onImport: (text: string) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");

  return (
    <details className="outline-import">
      <summary>テキストで一括インポート</summary>
      <textarea placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
      <button
        type="button"
        disabled={!text.trim()}
        onClick={() => {
          onImport(text);
          setText("");
        }}
      >
        インポート(既存の図形を置き換えます)
      </button>
    </details>
  );
}
