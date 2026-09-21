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
