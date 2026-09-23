import type { PointerEvent } from "react";
import type { ConnectorShape, Shape, ShapeId } from "../../core/model/shape";
import { resolveEndpoint } from "../../core/layout/connector";

export const ARROW_MARKER_ID = "quickchart-arrow-head";

const SELECTION_COLOR = "#2563eb";

interface ConnectorRendererProps {
  shape: ConnectorShape;
  shapes: Record<ShapeId, Shape>;
  selected: boolean;
  onPointerDown: (e: PointerEvent<SVGElement>) => void;
  onEndpointPointerDown?: (which: "from" | "to", e: PointerEvent<SVGElement>) => void;
}

export function ConnectorRenderer({
  shape,
  shapes,
  selected,
  onPointerDown,
  onEndpointPointerDown,
}: ConnectorRendererProps) {
  const start = resolveEndpoint(shape, "from", shapes);
  const end = resolveEndpoint(shape, "to", shapes);
  const stroke = selected ? SELECTION_COLOR : shape.style.stroke;
  const strokeWidth = Math.max(selected ? shape.style.strokeWidth + 1 : shape.style.strokeWidth, 2);

  return (
    <g>
      {/* Wider invisible line to make the connector easier to click/select. */}
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth={16} onPointerDown={onPointerDown} />
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={shape.style.strokeDasharray}
        markerEnd={shape.type === "arrow" ? `url(#${ARROW_MARKER_ID})` : undefined}
        pointerEvents="none"
      />
      {selected && onEndpointPointerDown && (
        <>
          <circle
            cx={start.x}
            cy={start.y}
            r={6}
            fill="#ffffff"
            stroke={SELECTION_COLOR}
            strokeWidth={2}
            onPointerDown={(e) => onEndpointPointerDown("from", e)}
          />
          <circle
            cx={end.x}
            cy={end.y}
            r={6}
            fill="#ffffff"
            stroke={SELECTION_COLOR}
            strokeWidth={2}
            onPointerDown={(e) => onEndpointPointerDown("to", e)}
          />
        </>
      )}
    </g>
  );
}
