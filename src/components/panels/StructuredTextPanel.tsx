import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useDocumentStore } from "../../core/store/documentStore";
import { useSelectionStore } from "../../core/store/selectionStore";
import { useStructuredEditorStore } from "../../core/store/structuredEditorStore";
import { parseOutline } from "../../core/templates/outlineParser";
import { parseBulletMatrixMarkdown } from "../../core/templates/bulletMatrixParser";
import { MATRIX_MAX_ROOTS } from "../../core/templates/matrix";
import { VENN_MAX_SETS, VENN_MIN_SETS } from "../../core/templates/venn";
import type { Milestone } from "../../core/templates/schedule";
import type { OutlineNode, StructuredBlock } from "../../core/model/document";

const PATTERN_LABEL: Record<StructuredBlock["pattern"], string> = {
  pyramid: "ツリー図",
  logicTree: "ロジックツリー図",
  matrix: "マトリクス",
  venn: "ベン図",
  headingBullets: "見出し付き箇条書き",
  bulletMatrix: "箇条書きマトリクス",
  pyramidChart: "ピラミッド図",
  schedule: "ガントチャート",
  verticalFlow: "フロー図（縦型）",
  horizontalFlow: "フロー図（横型）",
  flowSchedule: "フロースケジュール（縦）",
  flowScheduleHorizontal: "フロースケジュール（横）",
  timeline: "タイムライン",
  beforeAfter: "ビフォーアフター（縦）",
  beforeAfterHorizontal: "ビフォーアフター（横）",
  chevronFlow: "フローチャート",
  cycle: "サイクル図（円のみ）",
  cycleWithEntry: "サイクル図（導入部あり）",
  gridMatrix: "N×Nマトリクス",
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

// pyramidChart shares bulletMatrix's params.columnHeaders shape (doc/spec.md
// §6.2.5) - kept as its own function since the two patterns are otherwise
// unrelated in this file (separate PATTERN_LABEL entries, separate row
// prefill rules, etc.).
function pyramidChartColumnHeaders(params: Record<string, unknown>): string[] {
  const raw = params.columnHeaders;
  return Array.isArray(raw) ? raw.filter((h): h is string => typeof h === "string") : [];
}

// beforeAfterHorizontal's two column headers (doc/spec.md §6.2.13) - a fixed
// pair rather than bulletMatrix's/pyramidChart's dynamic list, since this
// pattern always has exactly a "before" and an "after" column.
function beforeAfterHorizontalLabels(params: Record<string, unknown>): { beforeLabel: string; afterLabel: string } {
  return {
    beforeLabel: typeof params.beforeLabel === "string" ? params.beforeLabel : "",
    afterLabel: typeof params.afterLabel === "string" ? params.afterLabel : "",
  };
}

// Matrix is fixed at 4 quadrants; Venn's root count follows params.setCount
// (2-3). Other patterns have no root limit. See doc/spec.md §6.2.1/§6.2.2 -
// the UI is expected to prevent exceeding these, with matrix.ts/venn.ts's own
// layout functions ignoring any excess as a defensive backstop.
function rootLimitFor(block: StructuredBlock): number {
  if (block.pattern === "matrix") return MATRIX_MAX_ROOTS;
  // gridMatrix is always exactly its horizontal + vertical axis (gridMatrix.ts).
  if (block.pattern === "gridMatrix") return 2;
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
  const updatePyramidChartColumns = useDocumentStore((s) => s.updatePyramidChartColumns);
  const updatePyramidChartTitle = useDocumentStore((s) => s.updatePyramidChartTitle);
  const updateFlowScheduleTitle = useDocumentStore((s) => s.updateFlowScheduleTitle);
  const updateFlowScheduleHorizontalTitle = useDocumentStore((s) => s.updateFlowScheduleHorizontalTitle);
  const updateTimelineTitle = useDocumentStore((s) => s.updateTimelineTitle);
  const updateCycleTitle = useDocumentStore((s) => s.updateCycleTitle);
  const updateGridMatrixTitle = useDocumentStore((s) => s.updateGridMatrixTitle);
  const updateBeforeAfterHorizontalLabels = useDocumentStore((s) => s.updateBeforeAfterHorizontalLabels);

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

  // schedule's row/bar tree needs dedicated date-field/connection-picker UI
  // per bar rather than the generic single-text-input OutlineRow (doc/spec.md
  // §6.2.6) - simplest as its own fully separate render path rather than
  // threading yet more pattern-specific branches through OutlineRow itself.
  if (block.pattern === "schedule") {
    return (
      <div className="structured-text-panel">
        <div className="structured-text-panel-header">
          <h3>階層テキスト({PATTERN_LABEL[block.pattern]})</h3>
          <button type="button" onClick={() => setActiveBlockId(null)}>
            閉じる
          </button>
        </div>
        <ScheduleEditor block={block} />
      </div>
    );
  }

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

      {block.pattern === "pyramidChart" && (
        <>
          <PyramidChartTitleInput
            key={`${block.id}-title`}
            title={typeof block.params.title === "string" ? block.params.title : ""}
            onCommit={(title) => updatePyramidChartTitle(block.id, title)}
          />
          <BulletMatrixColumnInputs
            key={`${block.id}-columns`}
            columnHeaders={pyramidChartColumnHeaders(block.params)}
            onCommit={(headers) => updatePyramidChartColumns(block.id, headers)}
          />
        </>
      )}

      {block.pattern === "flowSchedule" && (
        <PyramidChartTitleInput
          key={`${block.id}-title`}
          title={typeof block.params.title === "string" ? block.params.title : ""}
          onCommit={(title) => updateFlowScheduleTitle(block.id, title)}
        />
      )}

      {block.pattern === "flowScheduleHorizontal" && (
        <PyramidChartTitleInput
          key={`${block.id}-title`}
          title={typeof block.params.title === "string" ? block.params.title : ""}
          onCommit={(title) => updateFlowScheduleHorizontalTitle(block.id, title)}
        />
      )}

      {block.pattern === "timeline" && (
        <PyramidChartTitleInput
          key={`${block.id}-title`}
          title={typeof block.params.title === "string" ? block.params.title : ""}
          onCommit={(title) => updateTimelineTitle(block.id, title)}
        />
      )}

      {block.pattern === "gridMatrix" && (
        <PyramidChartTitleInput
          key={`${block.id}-title`}
          title={typeof block.params.title === "string" ? block.params.title : ""}
          onCommit={(title) => updateGridMatrixTitle(block.id, title)}
        />
      )}

      {(block.pattern === "cycle" || block.pattern === "cycleWithEntry") && (
        <PyramidChartTitleInput
          key={`${block.id}-title`}
          title={typeof block.params.title === "string" ? block.params.title : ""}
          onCommit={(title) => updateCycleTitle(block.id, title)}
        />
      )}

      {block.pattern === "beforeAfterHorizontal" && (
        <BeforeAfterHorizontalLabelInputs
          key={block.id}
          labels={beforeAfterHorizontalLabels(block.params)}
          onCommit={(labels) => updateBeforeAfterHorizontalLabels(block.id, labels)}
        />
      )}

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
              pattern={block.pattern}
              index={i}
            />
          ))}
        </div>
      )}
      {block.outline.length > 0 && atRootLimit && block.pattern !== "gridMatrix" && (
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

// beforeAfterHorizontal's two column headers (doc/spec.md §6.2.13) - a fixed
// pair like MatrixAxisLabelInputs' above, so it reuses that component's
// styling rather than needing its own CSS class.
function BeforeAfterHorizontalLabelInputs({
  labels,
  onCommit,
}: {
  labels: { beforeLabel: string; afterLabel: string };
  onCommit: (labels: { beforeLabel: string; afterLabel: string }) => void;
}) {
  const [beforeLabel, setBeforeLabel] = useState(labels.beforeLabel);
  const [afterLabel, setAfterLabel] = useState(labels.afterLabel);

  function commit() {
    onCommit({ beforeLabel, afterLabel });
  }

  return (
    <div className="matrix-axis-labels">
      <h4>列見出し</h4>
      <label>
        Before
        <input value={beforeLabel} onChange={(e) => setBeforeLabel(e.target.value)} onBlur={commit} />
      </label>
      <label>
        After
        <input value={afterLabel} onChange={(e) => setAfterLabel(e.target.value)} onBlur={commit} />
      </label>
    </div>
  );
}

// A single title field - pyramidChart's overall title (doc/spec.md §6.2.5)
// and flowSchedule's (§6.2.9), flowScheduleHorizontal's (§6.2.10), and
// timeline's (§6.2.11) all share this exact shape, so every one of them
// reuses it rather than each carrying its own near-identical input. Unlike
// MatrixAxisLabelInputs' pair, it reuses that component's styling
// (.matrix-axis-labels) rather than needing its own CSS class.
function PyramidChartTitleInput({ title, onCommit }: { title: string; onCommit: (title: string) => void }) {
  const [value, setValue] = useState(title);

  return (
    <div className="matrix-axis-labels">
      <h4>タイトル</h4>
      <label>
        見出し
        <input value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => onCommit(value)} />
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

function scheduleMonths(params: Record<string, unknown>): { startYear: number; startMonth: number; columnCount: number } {
  const today = new Date();
  return {
    startYear: typeof params.startYear === "number" ? params.startYear : today.getFullYear(),
    startMonth: typeof params.startMonth === "number" ? params.startMonth : today.getMonth() + 1, // Date's month is 0-indexed
    columnCount: typeof params.columnCount === "number" ? params.columnCount : 6,
  };
}

function scheduleMilestonesFrom(params: Record<string, unknown>): Milestone[] {
  const raw = params.milestones;
  return Array.isArray(raw)
    ? raw.filter((m): m is Milestone => typeof m === "object" && m !== null && typeof m.date === "string" && typeof m.label === "string")
    : [];
}

function scheduleConnectionsFrom(params: Record<string, unknown>): Record<string, string> {
  const raw = params.connections;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"));
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
  const updateScheduleMonths = useDocumentStore((s) => s.updateScheduleMonths);
  const updateScheduleMilestones = useDocumentStore((s) => s.updateScheduleMilestones);
  const updateScheduleConnections = useDocumentStore((s) => s.updateScheduleConnections);

  const connections = scheduleConnectionsFrom(block.params);
  // Flat "row label > bar label" list of every bar in the document, for each
  // bar's own "接続先" (connects-to) picker below.
  const allBars = block.outline.flatMap((row) =>
    row.children.map((bar) => ({ id: bar.id, label: `${row.text || "(無題の行)"} > ${bar.text || "(無題のバー)"}` })),
  );

  return (
    <>
      <ScheduleMonthsInput key={`${block.id}-months`} months={scheduleMonths(block.params)} onCommit={(m) => updateScheduleMonths(block.id, m)} />
      <ScheduleMilestonesInput
        key={`${block.id}-milestones`}
        milestones={scheduleMilestonesFrom(block.params)}
        onCommit={(m) => updateScheduleMilestones(block.id, m)}
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
                    onCommitConnections={(next) => updateScheduleConnections(block.id, next)}
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
  pattern,
  index,
  rootIndex,
}: {
  node: OutlineNode;
  blockId: string;
  depth: number;
  disableAddSibling?: boolean;
  pattern: StructuredBlock["pattern"];
  index?: number;
  // Index of the root (depth-0) node this row sits under - gridMatrix's
  // labels need to know which axis they belong to.
  rootIndex?: number;
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
  // pyramidChart's depth-1 nodes (child[0]="regbo/scale", child[1..]=table
  // cells) are position-aligned the same way (see pyramidChart.ts), except -
  // unlike a bulletMatrix cell - each one IS a leaf value with its own text,
  // so it keeps a real input instead of BulletMatrixColumnInputs' static
  // placeholder; only reordering/deleting/nesting it (which would shift every
  // later sibling's position) is disallowed.
  const isPyramidChartValue = pattern === "pyramidChart" && depth === 1;
  // verticalFlow's depth-1 badge (child[0], see verticalFlow.ts) is
  // position-locked the same way as pyramidChart's depth-1 values, but only
  // at position 0 - its sibling description lines (child[1..]) have no fixed
  // count or position, so they stay fully reorderable/deletable like any
  // other node.
  const isVerticalFlowBadge = pattern === "verticalFlow" && depth === 1 && index === 0;
  // timeline's depth-1 time label (child[0], see timeline.ts) is
  // position-locked the same way as verticalFlow's badge above - an event has
  // exactly this one child, no sibling description lines to keep reorderable.
  const isTimelineTimeLabel = pattern === "timeline" && depth === 1 && index === 0;
  // beforeAfter's depth-1 ASIS/TOBE blocks (child[0]/child[1], see
  // beforeAfter.ts) are position-locked at BOTH positions (unlike
  // verticalFlow's/timeline's single locked child[0]) - a topic always has
  // exactly these two. Unlike a bulletMatrix cell, each one IS a leaf value
  // with its own text (the headline), so it keeps a real input; unlike
  // pyramidChart's depth-1 values, "+子" stays enabled (see below) since a
  // block's description/extra-line children are real, freely-editable
  // content, not a leaf.
  const isBeforeAfterBlock = pattern === "beforeAfter" && depth === 1;
  // beforeAfterHorizontal's depth-1 "before"/"after" groups (child[0]/
  // child[1], see beforeAfterHorizontal.ts) are position-locked at BOTH
  // positions like beforeAfter's ASIS/TOBE blocks above - own text is a real
  // bullet line (the group's first item), so it keeps a real input; "+子"
  // stays enabled to add the group's remaining bullet lines.
  const isBeforeAfterHorizontalCell = pattern === "beforeAfterHorizontal" && depth === 1;
  // chevronFlow's depth-1 duration (child[0], see chevronFlow.ts) is
  // position-locked the same way as timeline's time label above; its sibling
  // bullets (child[1..]) stay fully reorderable/deletable.
  const isChevronFlowDuration = pattern === "chevronFlow" && depth === 1 && index === 0;
  // gridMatrix's two roots ARE its axes (root[0] horizontal, root[1]
  // vertical - see gridMatrix.ts), so they can't be moved, deleted or nested.
  // Their labels (depth 1) stay reorderable/deletable, but never nest: Tab is
  // blocked at every depth, and labels get no "+子".
  const isGridMatrixAxis = pattern === "gridMatrix" && depth === 0;
  const isGridMatrix = pattern === "gridMatrix";
  const isFixedPositionChild =
    isBulletMatrixCell ||
    isPyramidChartValue ||
    isVerticalFlowBadge ||
    isTimelineTimeLabel ||
    isBeforeAfterBlock ||
    isBeforeAfterHorizontalCell ||
    isChevronFlowDuration ||
    isGridMatrixAxis;

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      if (isPyramidChartValue || isVerticalFlowBadge || isTimelineTimeLabel || isBeforeAfterBlock || isBeforeAfterHorizontalCell || isChevronFlowDuration || isGridMatrix) return;
      if (e.shiftKey) outdentOutlineNode(blockId, node.id);
      else indentOutlineNode(blockId, node.id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (disableAddSibling || isPyramidChartValue || isVerticalFlowBadge || isTimelineTimeLabel || isBeforeAfterBlock || isBeforeAfterHorizontalCell || isChevronFlowDuration || isGridMatrixAxis) return;
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
            placeholder={
              isVerticalFlowBadge
                ? "バッジ(例: STEP 0)"
                : isTimelineTimeLabel
                  ? "時刻(例: 9:00)"
                  : isBeforeAfterBlock
                    ? index === 0
                      ? "AS-IS(見出し)"
                      : "TO-BE(見出し)"
                    : isBeforeAfterHorizontalCell
                      ? index === 0
                        ? "Before項目(1件目)"
                        : "After項目(1件目)"
                      : pattern === "beforeAfter" && depth === 0
                        ? "バッジ(例: 現場の悩み)"
                        : isChevronFlowDuration
                          ? "所要期間(例: 1週間、空欄可)"
                          : pattern === "cycleWithEntry" && depth === 0 && index === 0
                            ? "導入部(ループに入る前の段階)"
                            : isGridMatrixAxis
                              ? index === 0
                                ? "横軸の名前(例: 時間軸)"
                                : "縦軸の名前(例: 現在の事業との近さ)"
                              : isGridMatrix
                                ? rootIndex === 0
                                  ? "列の見出し(左から。例: 短期)"
                                  : "行の見出し(上から。例: 遠)"
                                : "項目を入力"
            }
            onChange={(e) => updateOutlineNodeText(blockId, node.id, e.target.value)}
            onKeyDown={handleKeyDown}
          />
        )}
        {!isFixedPositionChild && (
          <>
            <button type="button" title="上へ移動" onClick={() => moveOutlineNode(blockId, node.id, "up")}>
              ↑
            </button>
            <button type="button" title="下へ移動" onClick={() => moveOutlineNode(blockId, node.id, "down")}>
              ↓
            </button>
          </>
        )}
        {!isPyramidChartValue && !isVerticalFlowBadge && !isTimelineTimeLabel && !isChevronFlowDuration && !(isGridMatrix && depth > 0) && (
          <button type="button" title="子を追加" onClick={() => addOutlineChild(blockId, node.id)}>
            +子
          </button>
        )}
        {!isFixedPositionChild && (
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
          pattern={pattern}
          index={i}
          rootIndex={depth === 0 ? index : rootIndex}
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
