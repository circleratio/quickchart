import type { Document } from "../model/document";
import type { Shape, ShapeId, TextShape } from "../model/shape";
import { resolveEndpoint } from "../../components/canvas/ConnectorRenderer";

const ARROW_MARKER_ID = "export-arrow-head";
const DEFAULT_PADDING = 20;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rotationAttr(shape: Shape): string {
  if (!shape.rotation) return "";
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  return ` transform="rotate(${shape.rotation} ${cx} ${cy})"`;
}

function textAnchorFor(align: TextShape["align"]): "start" | "middle" | "end" {
  if (align === "center") return "middle";
  if (align === "right") return "end";
  return "start";
}

function textAnchorX(shape: TextShape): number {
  if (shape.align === "center") return shape.x + shape.width / 2;
  if (shape.align === "right") return shape.x + shape.width;
  return shape.x;
}

// Renders one shape as an SVG element string, mirroring
// ShapeRenderer.tsx/ConnectorRenderer.tsx closely enough that the exported
// file matches what the canvas shows (doc/spec.md §8.1: "キャンバス描画と
// 同じロジックを再利用"; this is a string-building sibling rather than the
// literal same code since React JSX can't be serialized to a plain string).
function renderShape(shape: Shape, shapes: Record<ShapeId, Shape>): string {
  const dasharray = shape.style.strokeDasharray ? ` stroke-dasharray="${shape.style.strokeDasharray}"` : "";

  switch (shape.type) {
    case "rect":
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" rx="${shape.cornerRadius ?? 0}" fill="${shape.style.fill}" stroke="${shape.style.stroke}" stroke-width="${shape.style.strokeWidth}"${dasharray}${rotationAttr(shape)} />`;
    case "ellipse":
      return `<ellipse cx="${shape.x + shape.width / 2}" cy="${shape.y + shape.height / 2}" rx="${shape.width / 2}" ry="${shape.height / 2}" fill="${shape.style.fill}" stroke="${shape.style.stroke}" stroke-width="${shape.style.strokeWidth}"${dasharray}${rotationAttr(shape)} />`;
    case "line":
      return `<line x1="${shape.x}" y1="${shape.y}" x2="${shape.x + shape.width}" y2="${shape.y + shape.height}" stroke="${shape.style.stroke}" stroke-width="${Math.max(shape.style.strokeWidth, 2)}"${dasharray}${rotationAttr(shape)} />`;
    case "text": {
      const x = textAnchorX(shape);
      const y = shape.y + shape.height / 2;
      return `<text x="${x}" y="${y}" text-anchor="${textAnchorFor(shape.align)}" dominant-baseline="middle" font-family="${escapeXml(shape.style.fontFamily ?? "sans-serif")}" font-size="${shape.style.fontSize ?? 16}" fill="${shape.style.textColor ?? "#000000"}"${rotationAttr(shape)}>${escapeXml(shape.content)}</text>`;
    }
    case "connector":
    case "arrow": {
      const start = resolveEndpoint(shape, "from", shapes);
      const end = resolveEndpoint(shape, "to", shapes);
      const marker = shape.type === "arrow" ? ` marker-end="url(#${ARROW_MARKER_ID}-${shape.id})"` : "";
      const markerDef =
        shape.type === "arrow"
          ? `<marker id="${ARROW_MARKER_ID}-${shape.id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${shape.style.stroke}" /></marker>`
          : "";
      const line = `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${shape.style.stroke}" stroke-width="${Math.max(shape.style.strokeWidth, 2)}"${dasharray}${marker} />`;
      return markerDef + line;
    }
    default:
      return "";
  }
}

// Bounding box in canvas coordinates covering every shape, with padding.
// Ignores rotation for simplicity (a heavily-rotated shape near the edge may
// clip slightly) - the same defensive-simplification precedent as the
// connector attach hit-test in core/layout/connector.ts.
function computeBounds(shapes: Shape[], padding: number) {
  const minX = Math.min(...shapes.map((s) => s.x)) - padding;
  const minY = Math.min(...shapes.map((s) => s.y)) - padding;
  const maxX = Math.max(...shapes.map((s) => s.x + s.width)) + padding;
  const maxY = Math.max(...shapes.map((s) => s.y + s.height)) + padding;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

// Builds a standalone SVG document string for the whole canvas (doc/spec.md
// §8.1). Used both for direct SVG export and as the source resvg rasterizes
// for PNG export (§8.2).
export function buildSvgDocument(doc: Document, padding: number = DEFAULT_PADDING): string {
  const shapes = Object.values(doc.shapes).sort((a, b) => a.zIndex - b.zIndex);

  if (shapes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"></svg>`;
  }

  const { minX, minY, width, height } = computeBounds(shapes, padding);
  const body = shapes.map((shape) => renderShape(shape, doc.shapes)).join("\n  ");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">`,
    `  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#ffffff" />`,
    `  ${body}`,
    `</svg>`,
  ].join("\n");
}
