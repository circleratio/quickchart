import { useState } from "react";
import { useDocumentStore } from "../../core/store/documentStore";
import { useSelectionStore } from "../../core/store/selectionStore";
import {
  errorMessageFor,
  exportEmfToClipboard,
  exportEmfToFile,
  exportPng,
  exportSvg,
  getRecentFiles,
  projectOpen,
  projectOpenPath,
  projectSave,
  projectSaveAs,
} from "../../core/io/tauriApi";
import { buildSvgDocument } from "../../core/io/svgExport";

const PNG_EXPORT_SCALE = 2;

export function Toolbar() {
  const canUndo = useDocumentStore((s) => s.canUndo);
  const canRedo = useDocumentStore((s) => s.canRedo);
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);
  const document = useDocumentStore((s) => s.document);
  const currentFilePath = useDocumentStore((s) => s.currentFilePath);
  const setCurrentFilePath = useDocumentStore((s) => s.setCurrentFilePath);
  const newDocument = useDocumentStore((s) => s.newDocument);
  const loadDocument = useDocumentStore((s) => s.loadDocument);

  const [toast, setToast] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [busy, setBusy] = useState(false);

  function showError(err: unknown) {
    const message = errorMessageFor(err);
    if (message) setToast(message);
  }

  function handleNew() {
    newDocument();
    useSelectionStore.getState().clear();
  }

  async function handleOpen() {
    setBusy(true);
    try {
      const result = await projectOpen();
      loadDocument(result.document, result.path);
      useSelectionStore.getState().clear();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenRecent(path: string) {
    setShowRecent(false);
    setBusy(true);
    try {
      const result = await projectOpenPath(path);
      loadDocument(result.document, result.path);
      useSelectionStore.getState().clear();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    setBusy(true);
    try {
      if (currentFilePath) {
        await projectSave(currentFilePath, document);
      } else {
        const result = await projectSaveAs(document);
        setCurrentFilePath(result.path);
      }
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAs() {
    setBusy(true);
    try {
      const result = await projectSaveAs(document);
      setCurrentFilePath(result.path);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleRecent() {
    if (!showRecent) {
      try {
        setRecentFiles(await getRecentFiles());
      } catch (err) {
        showError(err);
        return;
      }
    }
    setShowRecent((v) => !v);
  }

  async function handleExportSvg() {
    setShowExport(false);
    setBusy(true);
    try {
      await exportSvg(buildSvgDocument(document));
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleExportPng() {
    setShowExport(false);
    setBusy(true);
    try {
      await exportPng(buildSvgDocument(document), PNG_EXPORT_SCALE);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  // EMF failures fall back to a hint toward PNG export instead of the
  // automatic PNG-clipboard fallback doc/spec.md §8.3 describes - an MVP
  // scope trim noted there and in src-tauri/src/commands/export_emf.rs.
  async function handleExportEmfToFile() {
    setShowExport(false);
    setBusy(true);
    try {
      await exportEmfToFile(Object.values(document.shapes));
    } catch (err) {
      if (errorMessageFor(err) !== null) {
        setToast("EMFの書き出しに失敗しました。PNG画像としてのエクスポートをお試しください。");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleExportEmfToClipboard() {
    setShowExport(false);
    setBusy(true);
    try {
      await exportEmfToClipboard(Object.values(document.shapes));
      setToast("PowerPointなどに貼り付けできます");
    } catch (err) {
      if (errorMessageFor(err) !== null) {
        setToast("クリップボードへのコピーに失敗しました。PNG画像としてのエクスポートをお試しください。");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="toolbar">
      <button type="button" disabled={busy} onClick={handleNew}>
        新規作成
      </button>
      <button type="button" disabled={busy} onClick={handleOpen}>
        開く
      </button>
      <button type="button" disabled={busy} onClick={handleSave}>
        保存
      </button>
      <button type="button" disabled={busy} onClick={handleSaveAs}>
        名前を付けて保存
      </button>
      <div className="toolbar-recent">
        <button type="button" disabled={busy} onClick={handleToggleRecent}>
          直近使用ファイル
        </button>
        {showRecent && (
          <div className="toolbar-recent-list">
            {recentFiles.length === 0 ? (
              <div className="toolbar-recent-empty">履歴はありません</div>
            ) : (
              recentFiles.map((path) => (
                <button
                  key={path}
                  type="button"
                  className="toolbar-recent-item"
                  onClick={() => handleOpenRecent(path)}
                  title={path}
                >
                  {path}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <div className="toolbar-recent">
        <button type="button" disabled={busy} onClick={() => setShowExport((v) => !v)}>
          エクスポート
        </button>
        {showExport && (
          <div className="toolbar-recent-list">
            <button type="button" className="toolbar-recent-item" onClick={handleExportSvg}>
              SVGファイル
            </button>
            <button type="button" className="toolbar-recent-item" onClick={handleExportPng}>
              PNGファイル
            </button>
            <button type="button" className="toolbar-recent-item" onClick={handleExportEmfToFile}>
              EMFファイル(PowerPoint用)
            </button>
            <button type="button" className="toolbar-recent-item" onClick={handleExportEmfToClipboard}>
              EMFをクリップボードへコピー
            </button>
          </div>
        )}
      </div>
      <span className="toolbar-spacer" />
      <button type="button" disabled={!canUndo} onClick={undo} title="元に戻す (Ctrl+Z)">
        元に戻す
      </button>
      <button type="button" disabled={!canRedo} onClick={redo} title="やり直す (Ctrl+Y)">
        やり直す
      </button>
      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}
