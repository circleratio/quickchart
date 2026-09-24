import { useEffect, useRef, useState } from "react";
import { useDocumentStore } from "../../core/store/documentStore";
import { useStructuredEditorStore } from "../../core/store/structuredEditorStore";
import { useUserTemplateRefreshStore } from "../../core/store/userTemplateStore";
import type { StructuredBlock } from "../../core/model/document";
import type { UserTemplate } from "../../core/model/userTemplate";
import { deleteUserTemplate, errorMessageFor, getUserTemplates } from "../../core/io/tauriApi";

type LeafPattern = { id: StructuredBlock["pattern"]; label: string; available: boolean };

type PatternEntry = ({ kind: "leaf" } & LeafPattern) | { kind: "group"; label: string; children: LeafPattern[] };

// The "スケジュール" group bundles the pattern's own vertical/horizontal
// variants as a flat submenu rather than nesting a further cascade level
// (decided with the user: a 2nd cascade level wasn't worth the extra clicks
// for only 2 variants each).
const PATTERN_ENTRIES: PatternEntry[] = [
  { kind: "leaf", id: "pyramid", label: "ツリー図", available: true },
  { kind: "leaf", id: "logicTree", label: "ロジックツリー図", available: true },
  { kind: "leaf", id: "matrix", label: "４象限マトリクス", available: true },
  { kind: "leaf", id: "gridMatrix", label: "N×Nマトリクス", available: true },
  { kind: "leaf", id: "venn", label: "ベン図", available: true },
  { kind: "leaf", id: "headingBullets", label: "見出し付き箇条書き", available: true },
  { kind: "leaf", id: "bulletMatrix", label: "箇条書きマトリクス", available: true },
  { kind: "leaf", id: "pyramidChart", label: "ピラミッド図", available: true },
  {
    kind: "group",
    label: "スケジュール",
    children: [
      { id: "schedule", label: "ガントチャート", available: true },
      { id: "verticalFlow", label: "フロー図（縦型）", available: true },
      { id: "horizontalFlow", label: "フロー図（横型）", available: true },
      { id: "flowSchedule", label: "フロースケジュール（縦）", available: true },
      { id: "flowScheduleHorizontal", label: "フロースケジュール（横）", available: true },
      { id: "timeline", label: "タイムライン", available: true },
      { id: "chevronFlow", label: "フローチャート", available: true },
    ],
  },
  {
    kind: "group",
    label: "サイクル図",
    children: [
      { id: "cycleWithEntry", label: "サイクル図（導入部あり）", available: true },
      { id: "cycle", label: "サイクル図（円のみ）", available: true },
    ],
  },
  { id: "beforeAfter", label: "ビフォーアフター（縦）", available: true, kind: "leaf" },
  { id: "beforeAfterHorizontal", label: "ビフォーアフター（横）", available: true, kind: "leaf" },
];

interface TemplateLibraryPanelProps {
  pendingUserTemplate: UserTemplate | null;
  onSelectUserTemplate: (template: UserTemplate | null) => void;
}

// "①パターンを選択 → ②階層テキストを入力 → ③自動レイアウトで生成" (doc/spec.md §4.2):
// picking a pattern here creates an empty block right away and hands editing
// over to StructuredTextPanel, which grows it node by node.
export function TemplateLibraryPanel({ pendingUserTemplate, onSelectUserTemplate }: TemplateLibraryPanelProps) {
  const addStructuredBlock = useDocumentStore((s) => s.addStructuredBlock);
  const setActiveBlockId = useStructuredEditorStore((s) => s.setActiveBlockId);

  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refreshToken = useUserTemplateRefreshStore((s) => s.refreshToken);

  const [openGroupLabel, setOpenGroupLabel] = useState<string | null>(null);
  const [submenuPos, setSubmenuPos] = useState<{ top: number; left: number } | null>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const groupTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  async function refresh() {
    try {
      setUserTemplates(await getUserTemplates());
      setError(null);
    } catch (err) {
      const message = errorMessageFor(err);
      if (message) setError(message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  // Fixed positioning (computed from the trigger's own rect) rather than a
  // CSS-hover flyout: .left-column scrolls vertically, and setting
  // overflow-y also forces overflow-x to "auto" per spec, which would clip
  // an absolutely-positioned flyout extending past the panel's right edge.
  useEffect(() => {
    if (!openGroupLabel) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (submenuRef.current?.contains(target)) return;
      if (groupTriggerRefs.current[openGroupLabel!]?.contains(target)) return;
      setOpenGroupLabel(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openGroupLabel]);

  function toggleGroup(label: string) {
    if (openGroupLabel === label) {
      setOpenGroupLabel(null);
      return;
    }
    const rect = groupTriggerRefs.current[label]?.getBoundingClientRect();
    if (rect) setSubmenuPos({ top: rect.top, left: rect.right + 4 });
    setOpenGroupLabel(label);
  }

  function handlePick(pattern: StructuredBlock["pattern"]) {
    const blockId = addStructuredBlock(pattern);
    setActiveBlockId(blockId);
    setOpenGroupLabel(null);
  }

  async function handleDelete(id: string) {
    if (pendingUserTemplate?.id === id) onSelectUserTemplate(null);
    try {
      await deleteUserTemplate(id);
      await refresh();
    } catch (err) {
      const message = errorMessageFor(err);
      if (message) setError(message);
    }
  }

  return (
    <div className="template-library-panel">
      <h3>パターンライブラリ</h3>
      <div className="template-list">
        {PATTERN_ENTRIES.map((entry) =>
          entry.kind === "leaf" ? (
            <button
              key={entry.id}
              type="button"
              disabled={!entry.available}
              onClick={() => handlePick(entry.id)}
              title={entry.available ? undefined : "将来対応"}
            >
              {entry.label}
            </button>
          ) : (
            <button
              key={entry.label}
              type="button"
              ref={(el) => {
                groupTriggerRefs.current[entry.label] = el;
              }}
              className={openGroupLabel === entry.label ? "template-group-trigger active" : "template-group-trigger"}
              onClick={() => toggleGroup(entry.label)}
            >
              {entry.label}
              <span className="template-group-arrow">▶</span>
            </button>
          ),
        )}
      </div>

      {openGroupLabel &&
        submenuPos &&
        (() => {
          const group = PATTERN_ENTRIES.find((entry) => entry.kind === "group" && entry.label === openGroupLabel) as
            | { kind: "group"; label: string; children: LeafPattern[] }
            | undefined;
          if (!group) return null;
          return (
            <div
              ref={submenuRef}
              className="template-submenu"
              style={{ top: submenuPos.top, left: submenuPos.left }}
            >
              {group.children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  disabled={!child.available}
                  onClick={() => handlePick(child.id)}
                  title={child.available ? undefined : "将来対応"}
                >
                  {child.label}
                </button>
              ))}
            </div>
          );
        })()}

      <h3>マイテンプレート</h3>
      {error && <p className="template-library-error">{error}</p>}
      {userTemplates.length === 0 ? (
        <p className="template-library-empty">
          図形を選択して右パネルの「テンプレートとして登録」から追加できます。
        </p>
      ) : (
        <div className="template-list">
          {userTemplates.map((template) => (
            <div key={template.id} className="user-template-row">
              <button
                type="button"
                className={
                  pendingUserTemplate?.id === template.id ? "user-template-button active" : "user-template-button"
                }
                onClick={() =>
                  onSelectUserTemplate(pendingUserTemplate?.id === template.id ? null : template)
                }
                title="クリック後、キャンバス上をクリックして配置"
              >
                {template.name}
              </button>
              <button type="button" className="user-template-delete" title="削除" onClick={() => handleDelete(template.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {pendingUserTemplate && <p className="template-library-hint">配置先をキャンバスでクリックしてください</p>}
    </div>
  );
}
