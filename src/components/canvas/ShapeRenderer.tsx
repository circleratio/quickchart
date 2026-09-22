import type { PointerEvent } from "react";
import type { PolygonShape, Shape, TextShape } from "../../core/model/shape";

interface ShapeRendererProps {
  shape: Shape;
  selected: boolean;
  onPointerDown: (e: PointerEvent<SVGElement>) => void;
  elRef?: (el: SVGGraphicsElement | null) => void;
}

const SELECTION_COLOR = "#2563eb";

export function ShapeRenderer({ shape, selected, onPointerDown, elRef }: ShapeRendererProps) {
  const stroke = selected ? SELECTION_COLOR : shape.style.stroke;
  const strokeWidth = selected ? shape.style.strokeWidth + 1 : shape.style.strokeWidth;
  const transform = rotationTransform(shape);

  switch (shape.type) {
    case "rect":
      return (
        <rect
          ref={elRef}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          rx={shape.cornerRadius ?? 0}
          fill={shape.style.fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={shape.style.strokeDasharray}
          transform={transform}
          onPointerDown={onPointerDown}
        />
      );
    case "ellipse":
      return (
        <ellipse
          ref={elRef}
          cx={shape.x + shape.width / 2}
          cy={shape.y + shape.height / 2}
          rx={shape.width / 2}
          ry={shape.height / 2}
          fill={shape.style.fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={shape.style.strokeDasharray}
          transform={transform}
          onPointerDown={onPointerDown}
        />
      );
    case "line":
      return (
        <line
          ref={elRef}
          x1={shape.x}
          y1={shape.y}
          x2={shape.x + shape.width}
          y2={shape.y + shape.height}
          stroke={stroke}
          strokeWidth={Math.max(strokeWidth, 2)}
          strokeDasharray={shape.style.strokeDasharray}
          transform={transform}
          onPointerDown={onPointerDown}
        />
      );
    case "polygon":
      return (
        <polygon
          ref={elRef}
          points={polygonPoints(shape)}
          fill={shape.style.fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={shape.style.strokeDasharray}
          transform={transform}
          onPointerDown={onPointerDown}
        />
      );
    case "text":
      return (
        <TextShapeRenderer
          shape={shape}
          stroke={stroke}
          strokeWidth={strokeWidth}
          selected={selected}
          transform={transform}
          onPointerDown={onPointerDown}
          elRef={elRef}
        />
      );
    case "connector":
    case "arrow":
      // Implemented in Phase 5 (ConnectorRenderer.tsx).
      return null;
    default:
      return null;
  }
}

function TextShapeRenderer({
  shape,
  stroke,
  strokeWidth,
  selected,
  transform,
  onPointerDown,
  elRef,
}: {
  shape: TextShape;
  stroke: string;
  strokeWidth: number;
  selected: boolean;
  transform: string | undefined;
  onPointerDown: (e: PointerEvent<SVGElement>) => void;
  elRef?: (el: SVGGraphicsElement | null) => void;
}) {
  // Plain text (placed via the text tool) is a borderless label, matching a
  // typical textbox. A shape generated from a structured template
  // (pyramid/logicTree/matrix/venn/headingBullets/bulletMatrix) is usually
  // its own "layer" of the diagram, so it needs a visible box - shown using
  // the shape's own fill/stroke rather than the transparent/selection-only
  // style used for free text. The exception is a template shape styled via
  // labelStyle() (Venn's set name inside its own circle; headingBullets'
  // bullet items; bulletMatrix's title/detail lines within a cell) rather
  // than its own layer: its fill/stroke are already "none", so this still
  // renders borderless like free text, just visible when selected.
  //
  // "Generated from a template" is `templateNodeIds !== undefined` - NOT
  // `.length > 0`. A template shape isn't always tied to a specific outline
  // node: bulletMatrix's column headers (params.columnHeaders, not the
  // outline - see bulletMatrix.ts) still get `templateNodeIds: []` from
  // regenerateBlockShapes (sync.ts), same as every other template shape,
  // just with zero ids in it. Treating that the same as "no template" (as a
  // `.length` check would) made them render transparent instead of their
  // intended solid fill - invisible against the canvas.
  const isTemplateNode = shape.templateNodeIds !== undefined;
  const boxFill = isTemplateNode ? shape.style.fill : "transparent";
  const boxStroke = isTemplateNode ? stroke : selected ? stroke : "none";
  const boxDasharray = isTemplateNode ? shape.style.strokeDasharray : "4 2";

  return (
    <g ref={elRef} transform={transform} onPointerDown={onPointerDown}>
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        fill={boxFill}
        stroke={boxStroke}
        strokeWidth={strokeWidth}
        strokeDasharray={boxDasharray}
      />
      <text
        x={textAnchorX(shape)}
        y={shape.y + shape.height / 2}
        textAnchor={textAnchor(shape.align)}
        dominantBaseline="middle"
        fontFamily={shape.style.fontFamily}
        fontSize={shape.style.fontSize}
        fontWeight={shape.style.fontWeight}
        fontStyle={shape.style.fontStyle}
        textDecoration={shape.style.textDecoration}
        fill={shape.style.textColor}
      >
        {shape.bulletMarker ? `${shape.bulletMarker}${shape.content}` : shape.content}
      </text>
    </g>
  );
}

// Resolves a PolygonShape's fraction-based `points` (see shape.ts) against its
// own bounding box into an SVG `points` attribute string.
function polygonPoints(shape: PolygonShape): string {
  return shape.points.map((p) => `${shape.x + p.x * shape.width},${shape.y + p.y * shape.height}`).join(" ");
}

function rotationTransform(shape: Shape): string | undefined {
  if (!shape.rotation) return undefined;
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  return `rotate(${shape.rotation} ${cx} ${cy})`;
}

function textAnchor(align: TextShape["align"]): "start" | "middle" | "end" {
  if (align === "center") return "middle";
  if (align === "right") return "end";
  return "start";
}

function textAnchorX(shape: TextShape): number {
  if (shape.align === "center") return shape.x + shape.width / 2;
  if (shape.align === "right") return shape.x + shape.width;
  return shape.x;
}
