import { useEffect, useState } from "react";
import { useDocumentStore } from "../../core/store/documentStore";
import { useStructuredEditorStore } from "../../core/store/structuredEditorStore";
import { useUserTemplateRefreshStore } from "../../core/store/userTemplateStore";
import type { StructuredBlock } from "../../core/model/document";
import type { UserTemplate } from "../../core/model/userTemplate";
import { deleteUserTemplate, errorMessageFor, getUserTemplates } from "../../core/io/tauriApi";

const PATTERNS: { id: StructuredBlock["pattern"]; label: string; available: boolean }[] = [
  { id: "pyramid", label: "ツリー図", available: true },
  { id: "logicTree", label: "ロジックツリー図", available: true },
  { id: "matrix", label: "マトリクス", available: true },
  { id: "venn", label: "ベン図", available: true },
  { id: "headingBullets", label: "見出し付き箇条書き", available: true },
  { id: "bulletMatrix", label: "箇条書きマトリクス", available: true },
  { id: "pyramidChart", label: "ピラミッド図", available: true },
  { id: "schedule", label: "スケジュール", available: true },
  { id: "verticalFlow", label: "フロー図（縦型）", available: true },
  { id: "horizontalFlow", label: "フロー図（横型）", available: true },
  { id: "flowSchedule", label: "フロースケジュール（縦）", available: true },
  { id: "flowScheduleHorizontal", label: "フロースケジュール（横）", available: true },
  { id: "timeline", label: "タイムライン", available: true },
  { id: "beforeAfter", label: "ビフォーアフター（縦）", available: true },
  { id: "beforeAfterHorizontal", label: "ビフォーアフター（横）", available: true },
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

  function handlePick(pattern: StructuredBlock["pattern"]) {
    const blockId = addStructuredBlock(pattern);
    setActiveBlockId(blockId);
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
        {PATTERNS.map((pattern) => (
          <button
            key={pattern.id}
            type="button"
            disabled={!pattern.available}
            onClick={() => handlePick(pattern.id)}
            title={pattern.available ? undefined : "将来対応"}
          >
            {pattern.label}
          </button>
        ))}
      </div>

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
