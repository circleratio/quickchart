import { useState } from "react";
import type { ChangeEvent } from "react";
import { v4 as uuidv4 } from "uuid";
import { useDocumentStore } from "../../core/store/documentStore";
import { useSelectionStore } from "../../core/store/selectionStore";
import { useUserTemplateRefreshStore } from "../../core/store/userTemplateStore";
import type { Shape, ShapePatch, TextShape } from "../../core/model/shape";
import type { ShapeStyle } from "../../core/model/style";
import { COLOR_THEMES } from "../../core/model/style";
import { normalizeShapesForTemplate } from "../../core/model/userTemplate";
import { errorMessageFor, saveUserTemplate } from "../../core/io/tauriApi";
import * as align from "../../core/layout/align";

type NumericField = "x" | "y" | "width" | "height" | "rotation";

const FONT_CHOICES = ["Yu Gothic, Meiryo, sans-serif", "MS Gothic, sans-serif", "serif", "sans-serif"];

export function PropertyPanel() {
  const document = useDocumentStore((s) => s.document);
  const beginGesture = useDocumentStore((s) => s.beginGesture);
  const updateShapeTransient = useDocumentStore((s) => s.updateShapeTransient);
  const commitGesture = useDocumentStore((s) => s.commitGesture);
  const updateShapes = useDocumentStore((s) => s.updateShapes);
  const duplicateShapes = useDocumentStore((s) => s.duplicateShapes);
  const groupShapes = useDocumentStore((s) => s.groupShapes);
  const ungroupShapes = useDocumentStore((s) => s.ungroupShapes);
  const bringToFront = useDocumentStore((s) => s.bringToFront);
  const sendToBack = useDocumentStore((s) => s.sendToBack);
  const bringForward = useDocumentStore((s) => s.bringForward);
  const sendBackward = useDocumentStore((s) => s.sendBackward);
  const setColorTheme = useDocumentStore((s) => s.setColorTheme);

  const selectedShapeIds = useSelectionStore((s) => s.selectedShapeIds);
  const selectMany = useSelectionStore((s) => s.selectMany);
  const copiedStyle = useSelectionStore((s) => s.copiedStyle);
  const copyStyleToClipboard = useSelectionStore((s) => s.copyStyle);
  const setEditingShapeId = useSelectionStore((s) => s.setEditingShapeId);
  const bumpUserTemplateRefresh = useUserTemplateRefreshStore((s) => s.bumpRefresh);

  const [templateName, setTemplateName] = useState("");
  const [templateStatus, setTemplateStatus] = useState<string | null>(null);

  const selectedShapes: Shape[] = selectedShapeIds
    .map((id) => document.shapes[id])
    .filter((s): s is Shape => Boolean(s));
  const single = selectedShapes.length === 1 ? selectedShapes[0] : null;
  const styleRef = selectedShapes[0]?.style;
  const textShapes = selectedShapes.filter((s): s is TextShape => s.type === "text");
  const textRef = textShapes[0];

  // beginGesture/commitGesture collapse an entire edit session (however many
  // keystrokes/drags occur between focus and blur) into a single undo step -
  // see doc/plan.md Phase 3 fix for why per-keystroke/per-drag-frame history
  // steps are wrong.
  function handleGestureFocus() {
    beginGesture();
  }

  function handleGestureBlur() {
    commitGesture();
  }

  function handleNumberChange(field: NumericField, e: ChangeEvent<HTMLInputElement>) {
    if (!single) return;
    const value = Number(e.target.value);
    if (Number.isNaN(value)) return;
    updateShapeTransient(single.id, { [field]: value });
  }

  // Continuous style inputs (color/number) go through the same gesture path.
  function applyStyleTransient(patch: Partial<ShapeStyle>) {
    for (const s of selectedShapes) {
      updateShapeTransient(s.id, { style: { ...s.style, ...patch } });
    }
  }

  // Discrete style inputs (select/button) commit as a single step immediately.
  function applyStyleCommitted(patch: Partial<ShapeStyle>) {
    const patches: Record<string, ShapePatch> = {};
    for (const s of selectedShapes) {
      patches[s.id] = { style: { ...s.style, ...patch } };
    }
    updateShapes(patches);
  }

  function applyTextAlign(value: TextShape["align"]) {
    const patches: Record<string, ShapePatch> = {};
    for (const s of textShapes) {
      patches[s.id] = { align: value };
    }
    updateShapes(patches);
  }

  function applyAlign(fn: (boxes: align.AlignBox[]) => align.PositionPatch) {
    const patch = fn(selectedShapes);
    updateShapes(patch);
  }

  function handleDuplicate() {
    const newIds = duplicateShapes(selectedShapeIds);
    selectMany(newIds);
  }

  async function handleRegisterTemplate() {
    const name = templateName.trim();
    if (!name || selectedShapes.length === 0) return;
    try {
      await saveUserTemplate({
        id: uuidv4(),
        name,
        shapes: normalizeShapesForTemplate(selectedShapes),
        createdAt: new Date().toISOString(),
      });
      bumpUserTemplateRefresh();
      setTemplateName("");
      setTemplateStatus(`「${name}」を登録しました`);
    } catch (err) {
      const message = errorMessageFor(err);
      setTemplateStatus(message ?? "登録に失敗しました");
    }
  }

  function handleCopyStyle() {
    if (single) copyStyleToClipboard(single.style);
  }

  function handlePasteStyle() {
    if (!copiedStyle) return;
    const patches: Record<string, ShapePatch> = {};
    for (const s of selectedShapes) {
      patches[s.id] = { style: { ...copiedStyle } };
    }
    updateShapes(patches);
  }

  return (
    <div className="property-panel">
      <div className="property-section">
        <h3>配色テーマ</h3>
        <div className="theme-row">
          {COLOR_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={
                theme.id === document.colorThemeId ? "theme-button theme-button-active" : "theme-button"
              }
              onClick={() => setColorTheme(theme.id)}
              title={theme.name}
            >
              <span className="theme-swatch" style={{ background: theme.primary[0] }} />
              {theme.name}
            </button>
          ))}
        </div>
      </div>

      {selectedShapes.length === 0 ? (
        <div className="property-panel-empty">図形を選択してください</div>
      ) : (
        <>
          {single && (
            <div className="property-section">
              <h3>位置・サイズ</h3>
              <label>
                X
                <input
                  type="number"
                  value={Math.round(single.x)}
                  onFocus={handleGestureFocus}
                  onChange={(e) => handleNumberChange("x", e)}
                  onBlur={handleGestureBlur}
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  value={Math.round(single.y)}
                  onFocus={handleGestureFocus}
                  onChange={(e) => handleNumberChange("y", e)}
                  onBlur={handleGestureBlur}
                />
              </label>
              <label>
                幅
                <input
                  type="number"
                  value={Math.round(single.width)}
                  onFocus={handleGestureFocus}
                  onChange={(e) => handleNumberChange("width", e)}
                  onBlur={handleGestureBlur}
                />
              </label>
              <label>
                高さ
                <input
                  type="number"
                  value={Math.round(single.height)}
                  onFocus={handleGestureFocus}
                  onChange={(e) => handleNumberChange("height", e)}
                  onBlur={handleGestureBlur}
                />
              </label>
              <label>
                回転
                <input
                  type="number"
                  value={Math.round(single.rotation)}
                  onFocus={handleGestureFocus}
                  onChange={(e) => handleNumberChange("rotation", e)}
                  onBlur={handleGestureBlur}
                />
              </label>
            </div>
          )}

          {styleRef && (
            <div className="property-section">
              <h3>スタイル</h3>
              <label>
                塗り色
                <input
                  type="color"
                  value={styleRef.fill}
                  onFocus={handleGestureFocus}
                  onChange={(e) => applyStyleTransient({ fill: e.target.value })}
                  onBlur={handleGestureBlur}
                />
              </label>
              <label>
                線色
                <input
                  type="color"
                  value={styleRef.stroke}
                  onFocus={handleGestureFocus}
                  onChange={(e) => applyStyleTransient({ stroke: e.target.value })}
                  onBlur={handleGestureBlur}
                />
              </label>
              <label>
                線太さ
                <input
                  type="number"
                  min={0}
                  value={styleRef.strokeWidth}
                  onFocus={handleGestureFocus}
                  onChange={(e) => applyStyleTransient({ strokeWidth: Number(e.target.value) || 0 })}
                  onBlur={handleGestureBlur}
                />
              </label>
              <label>
                線種
                <select
                  value={styleRef.strokeDasharray ? "dashed" : "solid"}
                  onChange={(e) =>
                    applyStyleCommitted({ strokeDasharray: e.target.value === "dashed" ? "6 4" : undefined })
                  }
                >
                  <option value="solid">実線</option>
                  <option value="dashed">破線</option>
                </select>
              </label>
              <div className="swatch-row">
                {COLOR_THEMES.find((t) => t.id === document.colorThemeId)?.primary.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="color-swatch"
                    style={{ background: color }}
                    title={`塗り色に適用: ${color}`}
                    onClick={() => applyStyleCommitted({ fill: color })}
                  />
                ))}
              </div>
              <div className="button-row">
                <button type="button" disabled={!single} onClick={handleCopyStyle}>
                  書式をコピー
                </button>
                <button type="button" disabled={!copiedStyle} onClick={handlePasteStyle}>
                  書式を貼り付け
                </button>
              </div>
            </div>
          )}

          {textRef && (
            <div className="property-section">
              <h3>テキスト</h3>
              {single && (
                <button type="button" onClick={() => setEditingShapeId(single.id)}>
                  内容を編集(ダブルクリックでも可)
                </button>
              )}
              <label>
                フォント
                <select
                  value={textRef.style.fontFamily ?? FONT_CHOICES[0]}
                  onChange={(e) => applyStyleCommitted({ fontFamily: e.target.value })}
                >
                  {FONT_CHOICES.map((font) => (
                    <option key={font} value={font}>
                      {font.split(",")[0]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                文字サイズ
                <input
                  type="number"
                  min={1}
                  value={textRef.style.fontSize ?? 16}
                  onFocus={handleGestureFocus}
                  onChange={(e) => applyStyleTransient({ fontSize: Number(e.target.value) || 1 })}
                  onBlur={handleGestureBlur}
                />
              </label>
              <label>
                文字色
                <input
                  type="color"
                  value={textRef.style.textColor ?? "#000000"}
                  onFocus={handleGestureFocus}
                  onChange={(e) => applyStyleTransient({ textColor: e.target.value })}
                  onBlur={handleGestureBlur}
                />
              </label>
              <div className="button-row">
                <button
                  type="button"
                  className={textRef.align === "left" ? "tool-button-active" : ""}
                  onClick={() => applyTextAlign("left")}
                >
                  左揃え
                </button>
                <button
                  type="button"
                  className={textRef.align === "center" ? "tool-button-active" : ""}
                  onClick={() => applyTextAlign("center")}
                >
                  中央揃え
                </button>
                <button
                  type="button"
                  className={textRef.align === "right" ? "tool-button-active" : ""}
                  onClick={() => applyTextAlign("right")}
                >
                  右揃え
                </button>
              </div>
            </div>
          )}

          <div className="property-section">
            <h3>整列</h3>
            <div className="button-row">
              <button type="button" disabled={selectedShapes.length < 2} onClick={() => applyAlign(align.alignLeft)}>
                左揃え
              </button>
              <button
                type="button"
                disabled={selectedShapes.length < 2}
                onClick={() => applyAlign(align.alignCenterHorizontal)}
              >
                左右中央
              </button>
              <button
                type="button"
                disabled={selectedShapes.length < 2}
                onClick={() => applyAlign(align.alignRight)}
              >
                右揃え
              </button>
            </div>
            <div className="button-row">
              <button type="button" disabled={selectedShapes.length < 2} onClick={() => applyAlign(align.alignTop)}>
                上揃え
              </button>
              <button
                type="button"
                disabled={selectedShapes.length < 2}
                onClick={() => applyAlign(align.alignCenterVertical)}
              >
                上下中央
              </button>
              <button
                type="button"
                disabled={selectedShapes.length < 2}
                onClick={() => applyAlign(align.alignBottom)}
              >
                下揃え
              </button>
            </div>
            <div className="button-row">
              <button
                type="button"
                disabled={selectedShapes.length < 3}
                onClick={() => applyAlign(align.distributeHorizontally)}
              >
                水平方向に分布
              </button>
              <button
                type="button"
                disabled={selectedShapes.length < 3}
                onClick={() => applyAlign(align.distributeVertically)}
              >
                垂直方向に分布
              </button>
            </div>
          </div>

          <div className="property-section">
            <h3>グループ・順序</h3>
            <div className="button-row">
              <button
                type="button"
                disabled={selectedShapes.length < 2}
                onClick={() => groupShapes(selectedShapeIds)}
              >
                グループ化
              </button>
              <button type="button" onClick={() => ungroupShapes(selectedShapeIds)}>
                グループ解除
              </button>
            </div>
            <div className="button-row">
              <button type="button" onClick={() => bringToFront(selectedShapeIds)}>
                最前面へ
              </button>
              <button type="button" onClick={() => bringForward(selectedShapeIds)}>
                前面へ
              </button>
              <button type="button" onClick={() => sendBackward(selectedShapeIds)}>
                背面へ
              </button>
              <button type="button" onClick={() => sendToBack(selectedShapeIds)}>
                最背面へ
              </button>
            </div>
          </div>

          <div className="property-section">
            <h3>複製</h3>
            <button type="button" onClick={handleDuplicate}>
              複製 (Ctrl+D)
            </button>
          </div>

          <div className="property-section">
            <h3>テンプレートとして登録</h3>
            <div className="button-row">
              <input
                type="text"
                placeholder="テンプレート名"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              <button type="button" disabled={!templateName.trim()} onClick={handleRegisterTemplate}>
                登録
              </button>
            </div>
            {templateStatus && <p className="template-register-status">{templateStatus}</p>}
          </div>
        </>
      )}
    </div>
  );
}
