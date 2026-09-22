import { useEffect, useRef } from "react";
import Moveable from "react-moveable";
import type { Shape } from "../../core/model/shape";
import { computeAnchoredResize } from "../../core/layout/resize";

interface SelectionOverlayProps {
  target: SVGGraphicsElement;
  shape: Shape;
  scale: number;
  onTransformStart: () => void;
  onResize: (patch: { x: number; y: number; width: number; height: number }) => void;
  onRotate: (rotation: number) => void;
  onTransformEnd: () => void;
}

const MIN_SIZE = 4;
const DEG_TO_RAD = Math.PI / 180;

interface ResizeStartState {
  clientX: number;
  clientY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface RotateStartState {
  centerX: number;
  centerY: number;
  startAngleDeg: number;
  startRotation: number;
}

// react-moveable's own onResize width/beforeTranslate and onRotate beforeRotate
// values proved unreliable once the target sits inside our zoomed/panned SVG <g>
// (resize grew less than the drag distance, and rotation direction flipped for
// counter-clockwise drags). Instead we only use react-moveable to detect *that*
// a handle is being dragged and *which* one (direction / clientX,clientY), and do
// all the geometry ourselves (core/layout/resize.ts) from the shape model,
// matching the plain pointer-delta math already used for move-drag in Canvas.tsx.
export function SelectionOverlay({
  target,
  shape,
  scale,
  onTransformStart,
  onResize,
  onRotate,
  onTransformEnd,
}: SelectionOverlayProps) {
  const resizeStartRef = useRef<ResizeStartState | null>(null);
  const rotateStartRef = useRef<RotateStartState | null>(null);
  const moveableRef = useRef<Moveable>(null);

  // Move-drag (Canvas.tsx's own pointer handlers, not react-moveable's -
  // `draggable` is deliberately not set above) repositions the target by
  // updating the shape's x/y in the store, which re-renders ShapeRenderer at
  // its new position - but react-moveable only re-measures the target's box
  // on its own gestures, not on an arbitrary external DOM change, so its
  // selection frame/handles were left stuck at wherever the target was when
  // selected (the reported bug). `updateRect()` is react-moveable's own
  // documented hook for this ("if the location or size of the target is
  // changed, call the `.updateRect()` method") - align/distribute and Undo/
  // Redo reposition shapes the same external way, so this isn't drag-only.
  useEffect(() => {
    moveableRef.current?.updateRect();
  }, [shape.x, shape.y, shape.width, shape.height, shape.rotation]);

  return (
    <Moveable
      ref={moveableRef}
      target={target}
      resizable
      rotatable
      keepRatio={false}
      throttleRotate={1}
      rotationPosition="top"
      onResizeStart={(e) => {
        onTransformStart();
        resizeStartRef.current = {
          clientX: e.clientX,
          clientY: e.clientY,
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
          rotation: shape.rotation,
        };
      }}
      onResizeEnd={onTransformEnd}
      onResize={(e) => {
        const start = resizeStartRef.current;
        if (!start) return;

        const worldDelta = {
          dx: (e.clientX - start.clientX) / scale,
          dy: (e.clientY - start.clientY) / scale,
        };
        const result = computeAnchoredResize(
          start,
          e.direction as [number, number],
          worldDelta,
          MIN_SIZE,
        );
        onResize(result);

        e.target.style.transform = "";
        e.target.style.width = "";
        e.target.style.height = "";
      }}
      onRotateStart={(e) => {
        onTransformStart();
        const rect = target.getBoundingClientRect();
        const centerX = (rect.left + rect.right) / 2;
        const centerY = (rect.top + rect.bottom) / 2;
        rotateStartRef.current = {
          centerX,
          centerY,
          startAngleDeg: Math.atan2(e.clientY - centerY, e.clientX - centerX) / DEG_TO_RAD,
          startRotation: shape.rotation,
        };
      }}
      onRotateEnd={onTransformEnd}
      onRotate={(e) => {
        const start = rotateStartRef.current;
        if (!start) return;
        const currentAngleDeg = Math.atan2(e.clientY - start.centerY, e.clientX - start.centerX) / DEG_TO_RAD;
        let delta = currentAngleDeg - start.startAngleDeg;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        onRotate(start.startRotation + delta);
        e.target.style.transform = "";
      }}
    />
  );
}
