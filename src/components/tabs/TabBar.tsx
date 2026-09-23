import { useState } from "react";
import { useDocumentStore } from "../../core/store/documentStore";
import { useSelectionStore } from "../../core/store/selectionStore";
import { useStructuredEditorStore } from "../../core/store/structuredEditorStore";
import { useTabCloseStore } from "../../core/store/tabCloseStore";
import { ConfirmDialog } from "../common/ConfirmDialog";

// One project file can hold several independent tabs/pages (doc/requirement.md
// §4.7, doc/spec.md §5.2). Switching/adding/closing a tab clears selection and
// the active structured-template block, since those ids point into whichever
// tab was active before (doc/spec.md §4.1).
function resetActiveTabUiState() {
  useSelectionStore.getState().clear();
  useStructuredEditorStore.getState().setActiveBlockId(null);
}

export function TabBar() {
  const tabs = useDocumentStore((s) => s.tabs);
  const activeTabId = useDocumentStore((s) => s.activeTabId);
  const addTab = useDocumentStore((s) => s.addTab);
  const switchTab = useDocumentStore((s) => s.switchTab);
  const renameTab = useDocumentStore((s) => s.renameTab);
  const reorderTabs = useDocumentStore((s) => s.reorderTabs);
  const pendingTabId = useTabCloseStore((s) => s.pendingTabId);
  const requestCloseTab = useTabCloseStore((s) => s.requestCloseTab);
  const resolvePending = useTabCloseStore((s) => s.resolvePending);
  const pendingTab = tabs.find((tab) => tab.id === pendingTabId);

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);

  function handleSwitch(id: string) {
    if (id === activeTabId) return;
    switchTab(id);
    resetActiveTabUiState();
  }

  function handleAdd() {
    addTab();
    resetActiveTabUiState();
  }

  function handleClose(id: string) {
    if (requestCloseTab(id) === "closed") resetActiveTabUiState();
  }

  function handleConfirmClose(choice: "close" | "cancel") {
    if (resolvePending(choice)) resetActiveTabUiState();
  }

  function startRename(id: string, currentName: string) {
    setEditingTabId(id);
    setEditingName(currentName);
  }

  function commitRename() {
    if (editingTabId && editingName.trim() !== "") {
      renameTab(editingTabId, editingName.trim());
    }
    setEditingTabId(null);
  }

  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={tab.id === activeTabId ? "tab-bar-tab active" : "tab-bar-tab"}
          draggable
          onDragStart={() => setDraggedTabId(tab.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (draggedTabId && draggedTabId !== tab.id) reorderTabs(draggedTabId, tab.id);
            setDraggedTabId(null);
          }}
          onClick={() => handleSwitch(tab.id)}
          onDoubleClick={() => startRename(tab.id, tab.name)}
        >
          {editingTabId === tab.id ? (
            <input
              autoFocus
              className="tab-bar-rename-input"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={commitRename}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                else if (e.key === "Escape") setEditingTabId(null);
              }}
            />
          ) : (
            <span className="tab-bar-label" title={tab.name}>
              {tab.name}
            </span>
          )}
          <button
            type="button"
            className="tab-bar-close"
            disabled={tabs.length === 1}
            title="タブを閉じる"
            onClick={(e) => {
              e.stopPropagation();
              handleClose(tab.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="tab-bar-add" onClick={handleAdd} title="タブを追加 (Ctrl+T)">
        +
      </button>
      <ConfirmDialog
        open={pendingTab !== undefined}
        message={`タブ「${pendingTab?.name ?? ""}」を閉じますか？ タブの内容は元に戻せません。`}
        buttons={[
          { label: "閉じる", value: "close" },
          { label: "キャンセル", value: "cancel" },
        ]}
        onSelect={(value) => handleConfirmClose(value as "close" | "cancel")}
      />
    </div>
  );
}
