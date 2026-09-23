import { useEffect, useState } from "react";
import { Canvas } from "./components/canvas/Canvas";
import { ToolPanel } from "./components/panels/ToolPanel";
import { CommandPalette } from "./components/panels/CommandPalette";
import { PropertyPanel } from "./components/panels/PropertyPanel";
import { TemplateLibraryPanel } from "./components/panels/TemplateLibraryPanel";
import { StructuredTextPanel } from "./components/panels/StructuredTextPanel";
import { Toolbar } from "./components/toolbar/Toolbar";
import { TabBar } from "./components/tabs/TabBar";
import { useDocumentStore } from "./core/store/documentStore";
import { useSelectionStore } from "./core/store/selectionStore";
import { useStructuredEditorStore } from "./core/store/structuredEditorStore";
import { useTabCloseStore } from "./core/store/tabCloseStore";
import type { Tool } from "./core/model/shape";
import type { UserTemplate } from "./core/model/userTemplate";
import "./styles/theme.css";

// Clears UI-only state that points into "whichever tab is active" (selected/
// editing shape, active structured-template block) whenever the active tab
// itself changes - these ids are meaningless once the visible canvas swaps to
// a different tab's document (doc/spec.md §4.1).
function resetActiveTabUiState() {
  useSelectionStore.getState().clear();
  useStructuredEditorStore.getState().setActiveBlockId(null);
}

function App() {
  const [activeTool, setActiveTool] = useState<Tool>("select");
  // Set by TemplateLibraryPanel's "マイテンプレート" list; consumed by Canvas on
  // the next background click, same click-to-place flow as a shape tool
  // (doc/spec.md §6.4's "drop position" becomes "click position" here).
  const [pendingUserTemplate, setPendingUserTemplate] = useState<UserTemplate | null>(null);
  // ToolPanel's search icon / Ctrl+K opens this (doc/spec.md §5.1) - ephemeral
  // UI-only state, same "just a local state" treatment as activeTool/
  // pendingUserTemplate above rather than a dedicated store.
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const active = window.document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      // The tab-close confirmation (doc/spec.md §5.2) is modal: ignore shortcuts
      // such as a repeated Ctrl+W until it's answered.
      if (useTabCloseStore.getState().pendingTabId !== null) return;

      const isMod = e.ctrlKey || e.metaKey;
      const { selectedShapeIds } = useSelectionStore.getState();
      const store = useDocumentStore.getState();

      if (isMod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      } else if ((isMod && e.key.toLowerCase() === "y") || (isMod && e.shiftKey && e.key.toLowerCase() === "z")) {
        e.preventDefault();
        store.redo();
      } else if (isMod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        const newIds = store.duplicateShapes(selectedShapeIds);
        useSelectionStore.getState().selectMany(newIds);
      } else if (isMod && e.key.toLowerCase() === "c") {
        store.copyShapes(selectedShapeIds);
      } else if (isMod && e.key.toLowerCase() === "v") {
        const newIds = store.pasteClipboard();
        useSelectionStore.getState().selectMany(newIds);
      } else if (isMod && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        store.ungroupShapes(selectedShapeIds);
      } else if (isMod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        store.groupShapes(selectedShapeIds);
      } else if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (isMod && e.key === "Tab") {
        // Cycle tabs (doc/spec.md §5.2), wrapping at either end.
        e.preventDefault();
        const { tabs, activeTabId, switchTab } = store;
        const index = tabs.findIndex((tab) => tab.id === activeTabId);
        const nextIndex = e.shiftKey ? (index - 1 + tabs.length) % tabs.length : (index + 1) % tabs.length;
        switchTab(tabs[nextIndex].id);
        resetActiveTabUiState();
      } else if (isMod && e.key.toLowerCase() === "t") {
        e.preventDefault();
        store.addTab();
        resetActiveTabUiState();
      } else if (isMod && e.key.toLowerCase() === "w") {
        e.preventDefault();
        if (useTabCloseStore.getState().requestCloseTab(store.activeTabId) === "closed") resetActiveTabUiState();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        for (const id of selectedShapeIds) store.removeShape(id);
        useSelectionStore.getState().clear();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="app-root">
      <Toolbar />
      <div className="app-layout">
        <div className="left-column">
          <ToolPanel activeTool={activeTool} onSelectTool={setActiveTool} onOpenPalette={() => setPaletteOpen(true)} />
          <TemplateLibraryPanel
            pendingUserTemplate={pendingUserTemplate}
            onSelectUserTemplate={setPendingUserTemplate}
          />
          <StructuredTextPanel />
        </div>
        <div className="canvas-column">
          <TabBar />
          <Canvas
            activeTool={activeTool}
            onShapePlaced={() => setActiveTool("select")}
            pendingUserTemplate={pendingUserTemplate}
            onUserTemplatePlaced={() => setPendingUserTemplate(null)}
          />
        </div>
        <PropertyPanel />
      </div>
      <CommandPalette
        open={paletteOpen}
        onSelectTool={setActiveTool}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}

export default App;
