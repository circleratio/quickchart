import { useEffect, useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";
import { v4 as uuidv4 } from "uuid";
import { useDocumentStore } from "../../core/store/documentStore";
import { useSelectionStore } from "../../core/store/selectionStore";
import { createShape } from "../../core/model/shape";
import type { ConnectorShape, Shape, ShapeId, TextShape, Tool } from "../../core/model/shape";
import { defaultShapeStyle } from "../../core/model/style";
import { snapValue } from "../../core/layout/snap";
import { anchorPosition, isPointInsideBox, pickAnchor, resolveEndpoint } from "../../core/layout/connector";
import type { Point } from "../../core/layout/connector";
import { ShapeRenderer } from "./ShapeRenderer";
import { ConnectorRenderer, ARROW_MARKER_ID } from "./ConnectorRenderer";
import { SelectionOverlay } from "./SelectionOverlay";
import { AlignmentGuides, GuidesAndSnap } from "./GuidesAndSnap";
import { computeAlignmentGuides, unionBox } from "../../core/layout/guides";
import type { GuideLine } from "../../core/layout/guides";
import type { UserTemplate } from "../../core/model/userTemplate";

interface CanvasProps {
  activeTool: Tool;
  onShapePlaced: () => void;
  pendingUserTemplate: UserTemplate | null;
  onUserTemplatePlaced: () => void;
}

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

interface ConnectorDraft {
  startPoint: Point;
  startShapeId?: ShapeId;
  currentPoint: Point;
}

type DragState =
  | { kind: "pan"; startClientX: number; startClientY: number; startViewportX: number; startViewportY: number }
  | {
      kind: "shape";
      ids: ShapeId[];
      startClientX: number;
      startClientY: number;
      startPositions: Map<ShapeId, { x: number; y: number }>;
    }
  | { kind: "connectorEndpoint"; connectorId: ShapeId; which: "from" | "to" };

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const GRID_SIZE = 10;
// Alignment-guide snap distance in screen pixels (doc/spec.md §5.3), converted
// to canvas units with the current zoom so it feels the same at any scale.
const GUIDE_THRESHOLD_PX = 6;
const MIN_CONNECTOR_LENGTH = 4;
const DOUBLE_CLICK_MS = 700;

function isConnectorType(shape: Shape): shape is ConnectorShape {
  return shape.type === "connector" || shape.type === "arrow";
}

export function Canvas({ activeTool, onShapePlaced, pendingUserTemplate, onUserTemplatePlaced }: CanvasProps) {
  const document = useDocumentStore((state) => state.document);
  const addShape = useDocumentStore((state) => state.addShape);
  const beginGesture = useDocumentStore((state) => state.beginGesture);
  const updateShapeTransient = useDocumentStore((state) => state.updateShapeTransient);
  const commitGesture = useDocumentStore((state) => state.commitGesture);
  const updateShapeContent = useDocumentStore((state) => state.updateShapeContent);
  const placeUserTemplate = useDocumentStore((state) => state.placeUserTemplate);
  const selectedShapeIds = useSelectionStore((state) => state.selectedShapeIds);
  const select = useSelectionStore((state) => state.select);
  const selectMany = useSelectionStore((state) => state.selectMany);
  const toggle = useSelectionStore((state) => state.toggle);
  const clearSelection = useSelectionStore((state) => state.clear);

  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<DragState | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const shapeElRefs = useRef<Map<ShapeId, SVGGraphicsElement>>(new Map());
  const [selectedEl, setSelectedEl] = useState<SVGGraphicsElement | null>(null);
  const [connectorDraft, setConnectorDraft] = useState<ConnectorDraft | null>(null);
  // Display-only guides shown while dragging shapes; never stored in the document.
  const [guideLines, setGuideLines] = useState<GuideLine[]>([]);
  const editingShapeId = useSelectionStore((state) => state.editingShapeId);
  const setEditingShapeId = useSelectionStore((state) => state.setEditingShapeId);
  const lastClickRef = useRef<{ id: ShapeId; time: number } | null>(null);

  const isConnectorTool = activeTool === "connector" || activeTool === "arrow";
  const shapes = Object.values(document.shapes).sort((a, b) => a.zIndex - b.zIndex);
  const singleSelectedShape =
    selectedShapeIds.length === 1 ? document.shapes[selectedShapeIds[0]] : null;
  const singleSelectedIsConnector = singleSelectedShape ? isConnectorType(singleSelectedShape) : false;

  useEffect(() => {
    if (singleSelectedShape && !isConnectorType(singleSelectedShape)) {
      setSelectedEl(shapeElRefs.current.get(singleSelectedShape.id) ?? null);
    } else {
      setSelectedEl(null);
    }
  }, [singleSelectedShape]);

  function toCanvasPoint(clientX: number, clientY: number) {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewport.x) / viewport.scale,
      y: (clientY - rect.top - viewport.y) / viewport.scale,
    };
  }

  function resolveGroupSelection(id: ShapeId): ShapeId[] {
    const shape = document.shapes[id];
    if (!shape?.groupId) return [id];
    return shapes.filter((s) => s.groupId === shape.groupId).map((s) => s.id);
  }

  // Topmost non-connector shape whose bounding box contains `point` (MVP hit
  // test ignores rotation, see core/layout/connector.ts), for picking a
  // connector endpoint's attachment target. `excludeId` keeps a connector from
  // attaching to the shape it's already being dragged from.
  function findAttachTarget(point: Point, excludeId?: ShapeId): ShapeId | undefined {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const candidate = shapes[i];
      if (candidate.id === excludeId || isConnectorType(candidate)) continue;
      if (isPointInsideBox(candidate, point)) return candidate.id;
    }
    return undefined;
  }

  function finishConnectorDraft(draft: ConnectorDraft) {
    const endShapeId = findAttachTarget(draft.currentPoint, draft.startShapeId);
    const fromShape = draft.startShapeId ? document.shapes[draft.startShapeId] : undefined;
    const toShape = endShapeId ? document.shapes[endShapeId] : undefined;

    const fromReference = fromShape
      ? { x: fromShape.x + fromShape.width / 2, y: fromShape.y + fromShape.height / 2 }
      : draft.startPoint;
    const toReference = toShape
      ? { x: toShape.x + toShape.width / 2, y: toShape.y + toShape.height / 2 }
      : draft.currentPoint;

    const fromAnchor = fromShape ? pickAnchor(fromShape, toReference) : undefined;
    const toAnchor = toShape ? pickAnchor(toShape, fromReference) : undefined;
    const startPoint = fromShape && fromAnchor ? anchorPosition(fromShape, fromAnchor) : draft.startPoint;
    const endPoint = toShape && toAnchor ? anchorPosition(toShape, toAnchor) : draft.currentPoint;

    if (Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y) < MIN_CONNECTOR_LENGTH) return;

    const zIndex = Object.keys(document.shapes).length;
    const connector: ConnectorShape = {
      id: uuidv4(),
      type: activeTool === "arrow" ? "arrow" : "connector",
      x: Math.min(startPoint.x, endPoint.x),
      y: Math.min(startPoint.y, endPoint.y),
      width: Math.abs(endPoint.x - startPoint.x),
      height: Math.abs(endPoint.y - startPoint.y),
      rotation: 0,
      style: defaultShapeStyle(document.colorThemeId),
      zIndex,
      fromShapeId: draft.startShapeId,
      fromAnchor,
      toShapeId: endShapeId,
      toAnchor,
      points: [startPoint, endPoint],
    };
    addShape(connector);
    select(connector.id);
  }

  function handleBackgroundPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (e.target !== e.currentTarget) return;

    if (pendingUserTemplate) {
      const point = toCanvasPoint(e.clientX, e.clientY);
      const newIds = placeUserTemplate(pendingUserTemplate, point);
      selectMany(newIds);
      onUserTemplatePlaced();
      return;
    }

    if (isConnectorTool) {
      const point = toCanvasPoint(e.clientX, e.clientY);
      setConnectorDraft({ startPoint: point, currentPoint: point });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (activeTool !== "select") {
      const point = toCanvasPoint(e.clientX, e.clientY);
      const zIndex = Object.keys(document.shapes).length;
      const shape = createShape(activeTool, point, zIndex, document.colorThemeId);
      addShape(shape);
      select(shape.id);
      onShapePlaced();
      return;
    }

    clearSelection();
    dragRef.current = {
      kind: "pan",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startViewportX: viewport.x,
      startViewportY: viewport.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleShapePointerDown(id: ShapeId, e: PointerEvent<SVGElement>) {
    if (isConnectorTool) {
      e.stopPropagation();
      const point = toCanvasPoint(e.clientX, e.clientY);
      setConnectorDraft({ startPoint: point, startShapeId: id, currentPoint: point });
      svgRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    if (activeTool !== "select") return;
    e.stopPropagation();
    // Without this, a fast double-click also triggers the browser's native
    // "select the text under the cursor" behavior on the SVG <text> node,
    // which steals focus away from the edit textarea the instant it mounts
    // (looks like editing "doesn't accept input" - the textarea opens and
    // immediately blurs).
    e.preventDefault();

    // Manual double-click detection (from raw pointerdown timing) instead of
    // the native dblclick event, so the timing window is ours to tune -
    // DOUBLE_CLICK_MS is deliberately looser than a typical OS double-click
    // threshold.
    const shape = document.shapes[id];
    const now = performance.now();
    const isDoubleClick = lastClickRef.current?.id === id && now - lastClickRef.current.time < DOUBLE_CLICK_MS;
    lastClickRef.current = isDoubleClick ? null : { id, time: now };

    if (isDoubleClick && shape?.type === "text") {
      select(id);
      setEditingShapeId(id);
      return;
    }

    if (e.shiftKey) {
      toggle(id);
      return;
    }

    const groupIds = resolveGroupSelection(id);
    const alreadyPartOfSelection = selectedShapeIds.includes(id) && selectedShapeIds.length > 1;
    const idsForDrag = alreadyPartOfSelection ? selectedShapeIds : groupIds;
    if (!alreadyPartOfSelection) selectMany(idsForDrag);

    const startPositions = new Map(
      idsForDrag.map((sid) => [sid, { x: document.shapes[sid].x, y: document.shapes[sid].y }]),
    );
    dragRef.current = {
      kind: "shape",
      ids: idsForDrag,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPositions,
    };
    beginGesture();
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  function commitTextEdit(id: ShapeId, content: string) {
    updateShapeContent(id, content);
    setEditingShapeId(null);
  }

  function handleConnectorEndpointPointerDown(connectorId: ShapeId, which: "from" | "to", e: PointerEvent<SVGElement>) {
    e.stopPropagation();
    beginGesture();
    dragRef.current = { kind: "connectorEndpoint", connectorId, which };
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent<SVGSVGElement>) {
    if (connectorDraft) {
      setConnectorDraft({ ...connectorDraft, currentPoint: toCanvasPoint(e.clientX, e.clientY) });
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;

    if (drag.kind === "connectorEndpoint") {
      const point = toCanvasPoint(e.clientX, e.clientY);
      const shape = document.shapes[drag.connectorId];
      if (!shape || !isConnectorType(shape)) return;
      if (drag.which === "from") {
        const toPoint = resolveEndpoint(shape, "to", document.shapes);
        updateShapeTransient(drag.connectorId, { fromShapeId: undefined, fromAnchor: undefined, points: [point, toPoint] });
      } else {
        const fromPoint = resolveEndpoint(shape, "from", document.shapes);
        updateShapeTransient(drag.connectorId, { toShapeId: undefined, toAnchor: undefined, points: [fromPoint, point] });
      }
      return;
    }

    const dxClient = e.clientX - drag.startClientX;
    const dyClient = e.clientY - drag.startClientY;

    if (drag.kind === "pan") {
      setViewport((v) => ({ ...v, x: drag.startViewportX + dxClient, y: drag.startViewportY + dyClient }));
      return;
    }

    const dx = dxClient / viewport.scale;
    const dy = dyClient / viewport.scale;

    // Alignment guides against the shapes not being dragged (doc/spec.md §5.3).
    // Connectors are left out on both sides: their x/y/width/height don't
    // describe where they're drawn. An axis that snaps to a guide moves the
    // whole selection by one shared offset and skips the grid; an axis that
    // doesn't falls back to per-shape grid snapping as before.
    const draggedIds = new Set(drag.ids);
    const movingBoxes = drag.ids.flatMap((id) => {
      const shape = document.shapes[id];
      const start = drag.startPositions.get(id);
      if (!shape || !start || isConnectorType(shape)) return [];
      return [{ x: start.x + dx, y: start.y + dy, width: shape.width, height: shape.height }];
    });
    const otherBoxes = Object.values(document.shapes).filter(
      (shape) => !draggedIds.has(shape.id) && !isConnectorType(shape),
    );
    const moving = unionBox(movingBoxes);
    const guides = moving ? computeAlignmentGuides(moving, otherBoxes, GUIDE_THRESHOLD_PX / viewport.scale) : null;
    setGuideLines(guides?.lines ?? []);

    for (const id of drag.ids) {
      const start = drag.startPositions.get(id);
      if (!start) continue;
      updateShapeTransient(id, {
        x: guides?.snappedX ? start.x + dx + guides.dx : snapValue(start.x + dx, GRID_SIZE),
        y: guides?.snappedY ? start.y + dy + guides.dy : snapValue(start.y + dy, GRID_SIZE),
      });
    }
  }

  function handlePointerUp(e: PointerEvent<SVGSVGElement>) {
    if (connectorDraft) {
      finishConnectorDraft(connectorDraft);
      setConnectorDraft(null);
      onShapePlaced();
      if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
      return;
    }

    const drag = dragRef.current;
    dragRef.current = null;
    setGuideLines([]);
    if (drag?.kind === "shape" || drag?.kind === "connectorEndpoint") {
      // Endpoint drop: if it lands on a shape, reattach with a computed anchor.
      if (drag.kind === "connectorEndpoint") {
        const shape = document.shapes[drag.connectorId];
        if (shape && isConnectorType(shape)) {
          const point = drag.which === "from" ? shape.points[0] : shape.points[1];
          const targetId = point ? findAttachTarget(point, undefined) : undefined;
          const targetShape = targetId ? document.shapes[targetId] : undefined;
          if (targetShape && point) {
            const other = drag.which === "from" ? shape.points[1] : shape.points[0];
            const anchor = pickAnchor(targetShape, other ?? point);
            if (drag.which === "from") {
              updateShapeTransient(drag.connectorId, {
                fromShapeId: targetId,
                fromAnchor: anchor,
                points: [anchorPosition(targetShape, anchor), shape.points[1]],
              });
            } else {
              updateShapeTransient(drag.connectorId, {
                toShapeId: targetId,
                toAnchor: anchor,
                points: [shape.points[0], anchorPosition(targetShape, anchor)],
              });
            }
          }
        }
      }
      commitGesture();
    }
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
  }

  function handleWheel(e: WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;

    setViewport((v) => {
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * zoomFactor));
      const worldX = (pointer.x - v.x) / v.scale;
      const worldY = (pointer.y - v.y) / v.scale;
      return {
        scale: newScale,
        x: pointer.x - worldX * newScale,
        y: pointer.y - worldY * newScale,
      };
    });
  }

  return (
    <div className="canvas-container">
      <svg
        ref={svgRef}
        className="canvas-svg"
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      >
        <defs>
          <marker
            id={ARROW_MARKER_ID}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
        </defs>
        <GuidesAndSnap gridSize={GRID_SIZE} viewport={viewport} />
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
          {shapes.map((shape) =>
            isConnectorType(shape) ? (
              <ConnectorRenderer
                key={shape.id}
                shape={shape}
                shapes={document.shapes}
                selected={selectedShapeIds.includes(shape.id)}
                onPointerDown={(e) => handleShapePointerDown(shape.id, e)}
                onEndpointPointerDown={(which, e) => handleConnectorEndpointPointerDown(shape.id, which, e)}
              />
            ) : (
              <ShapeRenderer
                key={shape.id}
                shape={shape}
                selected={selectedShapeIds.includes(shape.id)}
                onPointerDown={(e) => handleShapePointerDown(shape.id, e)}
                elRef={(el) => {
                  if (el) shapeElRefs.current.set(shape.id, el);
                  else shapeElRefs.current.delete(shape.id);
                }}
              />
            ),
          )}
          <AlignmentGuides lines={guideLines} scale={viewport.scale} />
          {editingShapeId &&
            (() => {
              const editingShape = document.shapes[editingShapeId] as TextShape | undefined;
              if (!editingShape) return null;
              return (
                <foreignObject x={editingShape.x} y={editingShape.y} width={editingShape.width} height={editingShape.height}>
                  <textarea
                    className="text-edit-overlay"
                    autoFocus
                    defaultValue={editingShape.content}
                    style={{ fontFamily: editingShape.style.fontFamily, fontSize: editingShape.style.fontSize }}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => commitTextEdit(editingShapeId, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.blur();
                      } else if (e.key === "Escape") {
                        setEditingShapeId(null);
                      }
                    }}
                  />
                </foreignObject>
              );
            })()}
          {connectorDraft && (
            <line
              x1={connectorDraft.startPoint.x}
              y1={connectorDraft.startPoint.y}
              x2={connectorDraft.currentPoint.x}
              y2={connectorDraft.currentPoint.y}
              stroke="#2563eb"
              strokeWidth={2}
              strokeDasharray="4 2"
              pointerEvents="none"
            />
          )}
        </g>
      </svg>
      {selectedEl && singleSelectedShape && !singleSelectedIsConnector && editingShapeId !== singleSelectedShape.id && (
        <SelectionOverlay
          target={selectedEl}
          shape={singleSelectedShape}
          scale={viewport.scale}
          onTransformStart={beginGesture}
          onResize={(patch) => updateShapeTransient(singleSelectedShape.id, patch)}
          onRotate={(rotation) => updateShapeTransient(singleSelectedShape.id, { rotation })}
          onTransformEnd={commitGesture}
        />
      )}
    </div>
  );
}
