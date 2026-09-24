import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useDocumentStore } from "../../core/store/documentStore";
import { useSelectionStore } from "../../core/store/selectionStore";
import { useStructuredEditorStore } from "../../core/store/structuredEditorStore";
import { parseOutline } from "../../core/templates/outlineParser";
import { stringListParam } from "../../core/templates/patternDefinition";
import type { OutlineNodeRule, ParamEditor, ParamField, PatternDefinition } from "../../core/templates/patternDefinition";
import { patternOf } from "../../core/templates/registry";
import { scheduleParams } from "../../core/templates/schedule";
import type { Milestone } from "../../core/templates/schedule";
import type { OutlineNode, StructuredBlock } from "../../core/model/document";

// Everything pattern-specific in this panel - the header label, which params
// editors to show, the root limit, bulk-import format and how each outline
// node may be edited - comes from the pattern's PatternDefinition
// (core/templates/registry.ts).
export function StructuredTextPanel() {
  const document = useDocumentStore((s) => s.document);
  const addFirstOutlineNode = useDocumentStore((s) => s.addFirstOutlineNode);
  const replaceOutline = useDocumentStore((s) => s.replaceOutline);

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

  const definition = patternOf(block.pattern);
  const header = (
    <div className="structured-text-panel-header">
      <h3>階層テキスト({definition.label})</h3>
      <button type="button" onClick={() => setActiveBlockId(null)}>
        閉じる
      </button>
    </div>
  );

  // schedule's row/bar tree needs dedicated date-field/connection-picker UI
  // per bar rather than the generic single-text-input OutlineRow (doc/spec.md
  // §6.2.6) - simplest as its own fully separate render path rather than
  // threading yet more pattern-specific branches through OutlineRow itself.
  if (definition.customEditor === "schedule") {
    return (
      <div className="structured-text-panel">
        {header}
        <ScheduleEditor block={block} />
      </div>
    );
  }

  const atRootLimit = block.outline.length >= (definition.rootLimit?.(block.params) ?? Infinity);
  const editors = definition.paramEditors ?? [];
  const renderEditors = (placement: "aboveOutline" | "belowOutline") =>
    editors.map((editor, i) =>
      (editor.kind === "fields" ? (editor.placement ?? "aboveOutline") : "aboveOutline") === placement ? (
        <ParamEditorView key={`${block.id}-${i}`} editor={editor} block={block} definition={definition} />
      ) : null,
    );

  return (
    <div className="structured-text-panel">
      {header}

      {renderEditors("aboveOutline")}

      {block.outline.length === 0 ? (
        <button type="button" onClick={() => addFirstOutlineNode(block.id)}>
          + 最初の項目を追加
        </button>
      ) : (
        <div className="outline-tree">
          {block.outline.map((node, i) => (
            <OutlineRow
              key={node.id}
              node={node}
              blockId={block.id}
              depth={0}
              disableAddSibling={atRootLimit}
              definition={definition}
              index={i}
              rootIndex={i}
            />
          ))}
        </div>
      )}
      {block.outline.length > 0 && atRootLimit && definition.rootLimitNote && (
        <p className="outline-limit-note">{definition.rootLimitNote}</p>
      )}

      {renderEditors("belowOutline")}

      <ImportSection
        placeholder={definition.importPlaceholder}
        onImport={(text) => {
          if (!definition.importText) {
            replaceOutline(block.id, parseOutline(text));
            return;
          }
          const imported = definition.importText(text);
          replaceOutline(block.id, imported.outline, imported.params);
        }}
      />
    </div>
  );
}

// One of the pattern's PatternDefinition.paramEditors, showing the current
// values (as the pattern reads them - readParams) and committing every edit
// through updateBlockParams.
function ParamEditorView({ editor, block, definition }: { editor: ParamEditor; block: StructuredBlock; definition: PatternDefinition }) {
  const updateBlockParams = useDocumentStore((s) => s.updateBlockParams);
  const params = definition.readParams?.(block.params) ?? block.params;

  switch (editor.kind) {
    case "fields":
      return (
        <ParamFieldsInput
          heading={editor.heading}
          fields={editor.fields}
          values={Object.fromEntries(editor.fields.map(({ key }) => [key, typeof params[key] === "string" ? params[key] : ""]))}
          onCommit={(key, value) => updateBlockParams(block.id, { [key]: value })}
        />
      );
    case "list":
      return (
        <StringListInput
          heading={editor.heading}
          items={stringListParam(params, editor.key)}
          onCommit={(items) => updateBlockParams(block.id, { [editor.key]: items })}
        />
      );
    case "choice": {
      const raw = params[editor.key];
      return (
        <ChoiceInput
          name={`${block.id}-${editor.key}`}
          label={editor.label}
          options={editor.options}
          value={typeof raw === "number" ? raw : editor.defaultValue}
          onChange={(n) => updateBlockParams(block.id, { [editor.key]: n })}
        />
      );
    }
  }
}

function ChoiceInput({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: number[];
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="venn-set-count">
      <span>{label}</span>
      {options.map((n) => (
        <label key={n}>
          <input type="radio" name={name} checked={value === n} onChange={() => onChange(n)} />
          {n}
        </label>
      ))}
    </div>
  );
}

// Free-text params fields under one heading (a title, the matrix's axis-end
// labels, beforeAfterHorizontal's column labels, ...), each committed on
// blur.
function ParamFieldsInput({
  heading,
  fields,
  values: initialValues,
  onCommit,
}: {
  heading: string;
  fields: ParamField[];
  values: Record<string, string>;
  onCommit: (key: string, value: string) => void;
}) {
  const [values, setValues] = useState(initialValues);

  return (
    <div className="matrix-axis-labels">
      <h4>{heading}</h4>
      {fields.map(({ key, label, placeholder }) => (
        <label key={key}>
          {label}
          <input
            value={values[key]}
            placeholder={placeholder}
            onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            onBlur={() => onCommit(key, values[key])}
          />
        </label>
      ))}
    </div>
  );
}

// A growable list of strings (bulletMatrix's/pyramidChart's column headers,
// doc/spec.md §6.2.4/§6.2.5). Adding/removing an item commits immediately (it
// resizes every row's cells right away - see the patterns' onParamsChange);
// renaming one commits on blur, matching ParamFieldsInput.
function StringListInput({
  heading,
  items: initialItems,
  onCommit,
}: {
  heading: string;
  items: string[];
  onCommit: (items: string[]) => void;
}) {
  const [items, setItems] = useState(initialItems);

  return (
    <div className="bullet-matrix-columns">
      <h4>{heading}</h4>
      {items.map((item, i) => (
        <div className="bullet-matrix-column-row" key={i}>
          <input
            value={item}
            onChange={(e) => setItems((prev) => prev.map((h, j) => (j === i ? e.target.value : h)))}
            onBlur={() => onCommit(items)}
          />
          <button
            type="button"
            title="この列を削除"
            onClick={() => {
              const next = items.filter((_, j) => j !== i);
              setItems(next);
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
          const next = [...items, ""];
          setItems(next);
          onCommit(next);
        }}
      >
        + 列を追加
      </button>
    </div>
  );
}

// schedule's row/bar tree (doc/spec.md §6.2.6): a row is a plain label; each
// of its bars needs a label plus a start/end date (bar.children[0]/[1], see
// schedule.ts) and an optional "connects to" dependency link
// (params.connections) - different enough per-node shape from every other
// pattern's plain text row that it gets a wholly separate editor rather than
// OutlineRow's generic recursive tree.
function ScheduleEditor({ block }: { block: StructuredBlock }) {
  const addFirstOutlineNode = useDocumentStore((s) => s.addFirstOutlineNode);
  const addOutlineChild = useDocumentStore((s) => s.addOutlineChild);
  const addOutlineSibling = useDocumentStore((s) => s.addOutlineSibling);
  const deleteOutlineNode = useDocumentStore((s) => s.deleteOutlineNode);
  const moveOutlineNode = useDocumentStore((s) => s.moveOutlineNode);
  const updateOutlineNodeText = useDocumentStore((s) => s.updateOutlineNodeText);
  const updateBlockParams = useDocumentStore((s) => s.updateBlockParams);

  const { startYear, startMonth, columnCount, milestones, connections } = scheduleParams(block.params);
  // Flat "row label > bar label" list of every bar in the document, for each
  // bar's own "接続先" (connects-to) picker below.
  const allBars = block.outline.flatMap((row) =>
    row.children.map((bar) => ({ id: bar.id, label: `${row.text || "(無題の行)"} > ${bar.text || "(無題のバー)"}` })),
  );

  return (
    <>
      <ScheduleMonthsInput key={`${block.id}-months`} months={{ startYear, startMonth, columnCount }} onCommit={(m) => updateBlockParams(block.id, m)} />
      <ScheduleMilestonesInput
        key={`${block.id}-milestones`}
        milestones={milestones}
        onCommit={(m) => updateBlockParams(block.id, { milestones: m })}
      />

      {block.outline.length === 0 ? (
        <button type="button" onClick={() => addFirstOutlineNode(block.id)}>
          + 最初の行を追加
        </button>
      ) : (
        <div className="outline-tree">
          {block.outline.map((row, i) => (
            <div className="schedule-row" key={row.id}>
              <div className="outline-row">
                <span className="schedule-row-number">({i + 1})</span>
                <input
                  value={row.text}
                  placeholder="行のラベルを入力"
                  onChange={(e) => updateOutlineNodeText(block.id, row.id, e.target.value)}
                />
                <button type="button" title="上へ移動" onClick={() => moveOutlineNode(block.id, row.id, "up")}>
                  ↑
                </button>
                <button type="button" title="下へ移動" onClick={() => moveOutlineNode(block.id, row.id, "down")}>
                  ↓
                </button>
                <button type="button" title="行を追加" onClick={() => addOutlineSibling(block.id, row.id)}>
                  +行
                </button>
                <button type="button" title="削除" onClick={() => deleteOutlineNode(block.id, row.id)}>
                  ×
                </button>
              </div>
              <div className="schedule-bars">
                {row.children.map((bar) => (
                  <ScheduleBarEditor
                    key={bar.id}
                    bar={bar}
                    blockId={block.id}
                    allBars={allBars}
                    connections={connections}
                    onCommitConnections={(next) => updateBlockParams(block.id, { connections: next })}
                    onDelete={() => deleteOutlineNode(block.id, bar.id)}
                  />
                ))}
                <button type="button" onClick={() => addOutlineChild(block.id, row.id)}>
                  + バーを追加
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ScheduleMonthsInput({
  months,
  onCommit,
}: {
  months: { startYear: number; startMonth: number; columnCount: number };
  onCommit: (months: { startYear: number; startMonth: number; columnCount: number }) => void;
}) {
  const [startYear, setStartYear] = useState(months.startYear);
  const [startMonth, setStartMonth] = useState(months.startMonth);
  const [columnCount, setColumnCount] = useState(months.columnCount);

  function commit() {
    onCommit({ startYear, startMonth, columnCount });
  }

  return (
    <div className="matrix-axis-labels">
      <h4>期間</h4>
      <label>
        年
        <input type="number" value={startYear} onChange={(e) => setStartYear(Number(e.target.value))} onBlur={commit} />
      </label>
      <label>
        開始月
        <input type="number" min={1} max={12} value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))} onBlur={commit} />
      </label>
      <label>
        列数(月数)
        <input type="number" min={1} value={columnCount} onChange={(e) => setColumnCount(Number(e.target.value))} onBlur={commit} />
      </label>
    </div>
  );
}

// Milestones (doc/spec.md §6.2.6) - a dynamic list like BulletMatrixColumnInputs,
// just with a date field alongside each label.
function ScheduleMilestonesInput({ milestones, onCommit }: { milestones: Milestone[]; onCommit: (milestones: Milestone[]) => void }) {
  const [items, setItems] = useState(milestones);

  return (
    <div className="bullet-matrix-columns">
      <h4>マイルストーン</h4>
      {items.map((milestone, i) => (
        <div className="bullet-matrix-column-row" key={i}>
          <input
            type="date"
            value={milestone.date}
            onChange={(e) => setItems((prev) => prev.map((m, j) => (j === i ? { ...m, date: e.target.value } : m)))}
            onBlur={() => onCommit(items)}
          />
          <input
            value={milestone.label}
            placeholder="マイルストーン名"
            onChange={(e) => setItems((prev) => prev.map((m, j) => (j === i ? { ...m, label: e.target.value } : m)))}
            onBlur={() => onCommit(items)}
          />
          <button
            type="button"
            title="このマイルストーンを削除"
            onClick={() => {
              const next = items.filter((_, j) => j !== i);
              setItems(next);
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
          const next = [...items, { date: "", label: "" }];
          setItems(next);
          onCommit(next);
        }}
      >
        + マイルストーンを追加
      </button>
    </div>
  );
}

// One bar: label + start/end date (bar.children[0]/[1] - schedule.ts) + an
// optional dependency link to another bar anywhere in the document
// (params.connections, doc/spec.md §6.2.6), rendered as a plain <select>
// rather than a free-text reference since typing an exact bar id/name
// reliably isn't realistic.
function ScheduleBarEditor({
  bar,
  blockId,
  allBars,
  connections,
  onCommitConnections,
  onDelete,
}: {
  bar: OutlineNode;
  blockId: string;
  allBars: { id: string; label: string }[];
  connections: Record<string, string>;
  onCommitConnections: (connections: Record<string, string>) => void;
  onDelete: () => void;
}) {
  const updateOutlineNodeText = useDocumentStore((s) => s.updateOutlineNodeText);
  const startDateNode = bar.children[0];
  const endDateNode = bar.children[1];
  const connectsTo = connections[bar.id] ?? "";

  return (
    <div className="schedule-bar-item">
      <div className="schedule-bar-row">
        <input
          className="schedule-bar-label"
          value={bar.text}
          placeholder="バーのラベルを入力"
          onChange={(e) => updateOutlineNodeText(blockId, bar.id, e.target.value)}
        />
        <button type="button" title="このバーを削除" onClick={onDelete}>
          ×
        </button>
      </div>
      <div className="schedule-bar-row schedule-bar-details">
        <input
          type="date"
          value={startDateNode?.text ?? ""}
          onChange={(e) => startDateNode && updateOutlineNodeText(blockId, startDateNode.id, e.target.value)}
        />
        <span>〜</span>
        <input
          type="date"
          value={endDateNode?.text ?? ""}
          onChange={(e) => endDateNode && updateOutlineNodeText(blockId, endDateNode.id, e.target.value)}
        />
        <select
          value={connectsTo}
          onChange={(e) => {
            const next = { ...connections };
            if (e.target.value) next[bar.id] = e.target.value;
            else delete next[bar.id];
            onCommitConnections(next);
          }}
        >
          <option value="">(接続先なし)</option>
          {allBars
            .filter((b) => b.id !== bar.id)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
        </select>
      </div>
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
  definition,
  index,
  rootIndex,
}: {
  node: OutlineNode;
  blockId: string;
  depth: number;
  disableAddSibling?: boolean;
  definition: PatternDefinition;
  index: number;
  // Index of the root (depth-0) node this row sits under.
  rootIndex: number;
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

  // Position-based children (a step's badge, a row's cells, ...) are locked
  // by the pattern's own rule so the generic editor can't shift the
  // positions that give them their meaning (PatternDefinition.nodeRule).
  const rule: OutlineNodeRule = definition.nodeRule?.({ depth, index, rootIndex }) ?? {};

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      if (rule.noIndent) return;
      if (e.shiftKey) outdentOutlineNode(blockId, node.id);
      else indentOutlineNode(blockId, node.id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (disableAddSibling || rule.noAddSibling) return;
      addOutlineSibling(blockId, node.id);
      const block = useDocumentStore.getState().document.structuredBlocks.find((b) => b.id === blockId);
      const newNodeId = block ? findNextSiblingId(block.outline, node.id) : null;
      if (newNodeId) setPendingFocusNodeId(newNodeId);
    }
  }

  return (
    <div className="outline-node">
      <div className="outline-row" style={{ paddingLeft: depth * 16 }}>
        {rule.staticLabel !== undefined ? (
          <span className="outline-row-static-label">{rule.staticLabel}</span>
        ) : (
          <input
            ref={inputRef}
            value={node.text}
            placeholder={rule.placeholder ?? "項目を入力"}
            onChange={(e) => updateOutlineNodeText(blockId, node.id, e.target.value)}
            onKeyDown={handleKeyDown}
          />
        )}
        {!rule.fixed && (
          <>
            <button type="button" title="上へ移動" onClick={() => moveOutlineNode(blockId, node.id, "up")}>
              ↑
            </button>
            <button type="button" title="下へ移動" onClick={() => moveOutlineNode(blockId, node.id, "down")}>
              ↓
            </button>
          </>
        )}
        {!rule.noAddChild && (
          <button type="button" title="子を追加" onClick={() => addOutlineChild(blockId, node.id)}>
            +子
          </button>
        )}
        {!rule.fixed && (
          <button type="button" title="削除" onClick={() => deleteOutlineNode(blockId, node.id)}>
            ×
          </button>
        )}
      </div>
      {node.children.map((child, i) => (
        <OutlineRow
          key={child.id}
          node={child}
          blockId={blockId}
          depth={depth + 1}
          definition={definition}
          index={i}
          rootIndex={rootIndex}
        />
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
