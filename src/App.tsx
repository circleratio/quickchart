import { useEffect, useState } from "react";
import { Canvas } from "./components/canvas/Canvas";
import { ToolPanel } from "./components/panels/ToolPanel";
import { PropertyPanel } from "./components/panels/PropertyPanel";
import { TemplateLibraryPanel } from "./components/panels/TemplateLibraryPanel";
import { StructuredTextPanel } from "./components/panels/StructuredTextPanel";
import { Toolbar } from "./components/toolbar/Toolbar";
import { useDocumentStore } from "./core/store/documentStore";
import { useSelectionStore } from "./core/store/selectionStore";
import type { Tool } from "./core/model/shape";
import type { UserTemplate } from "./core/model/userTemplate";
import "./styles/theme.css";

function App() {
  const [activeTool, setActiveTool] = useState<Tool>("select");
  // Set by TemplateLibraryPanel's "マイテンプレート" list; consumed by Canvas on
  // the next background click, same click-to-place flow as a shape tool
  // (doc/spec.md §6.4's "drop position" becomes "click position" here).
  const [pendingUserTemplate, setPendingUserTemplate] = useState<UserTemplate | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const active = window.document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

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
          <ToolPanel activeTool={activeTool} onSelectTool={setActiveTool} />
          <TemplateLibraryPanel
            pendingUserTemplate={pendingUserTemplate}
            onSelectUserTemplate={setPendingUserTemplate}
          />
          <StructuredTextPanel />
        </div>
        <Canvas
          activeTool={activeTool}
          onShapePlaced={() => setActiveTool("select")}
          pendingUserTemplate={pendingUserTemplate}
          onUserTemplatePlaced={() => setPendingUserTemplate(null)}
        />
        <PropertyPanel />
      </div>
    </div>
  );
}

export default App;
