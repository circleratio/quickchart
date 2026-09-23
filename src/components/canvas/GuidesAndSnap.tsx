import type { GuideLine } from "../../core/layout/guides";

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

interface GuidesAndSnapProps {
  gridSize: number;
  viewport: Viewport;
}

const GRID_PATTERN_ID = "quickchart-grid-pattern";

// Renders as a background layer inside Canvas.tsx's <svg>, before the shapes group.
export function GuidesAndSnap({ gridSize, viewport }: GuidesAndSnapProps) {
  const scaledGrid = gridSize * viewport.scale;
  if (scaledGrid < 4) return null;

  const offsetX = viewport.x % scaledGrid;
  const offsetY = viewport.y % scaledGrid;

  return (
    <>
      <defs>
        <pattern
          id={GRID_PATTERN_ID}
          width={scaledGrid}
          height={scaledGrid}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${offsetX} ${offsetY})`}
        >
          <path d={`M ${scaledGrid} 0 L 0 0 0 ${scaledGrid}`} fill="none" stroke="#e5e9ef" strokeWidth={1} />
        </pattern>
      </defs>
      {/* pointerEvents="none" so clicks pass through to the <svg> background handler in Canvas.tsx */}
      <rect x={0} y={0} width="100%" height="100%" fill={`url(#${GRID_PATTERN_ID})`} pointerEvents="none" />
    </>
  );
}

// Same blue as selection handles, so guides read as part of the drag feedback.
const GUIDE_COLOR = "#2563eb";

interface AlignmentGuidesProps {
  lines: GuideLine[];
  scale: number;
}

// Alignment guides shown while dragging (doc/spec.md §5.3). Rendered in
// Canvas.tsx inside the viewport-transformed group, after the shapes, so the
// lines sit in front of them; stroke width is divided by the zoom to stay a
// constant 1px on screen.
export function AlignmentGuides({ lines, scale }: AlignmentGuidesProps) {
  if (lines.length === 0) return null;
  return (
    <g pointerEvents="none">
      {lines.map((line, i) =>
        line.axis === "x" ? (
          <line key={i} x1={line.position} y1={line.from} x2={line.position} y2={line.to} stroke={GUIDE_COLOR} strokeWidth={1 / scale} />
        ) : (
          <line key={i} x1={line.from} y1={line.position} x2={line.to} y2={line.position} stroke={GUIDE_COLOR} strokeWidth={1 / scale} />
        ),
      )}
    </g>
  );
}
