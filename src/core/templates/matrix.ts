import type { OutlineNode } from "../model/document";
import type { LayoutNode } from "./treeLayout";

const QUADRANT_SIZE = 280;
const QUADRANT_GAP = 24;
const TITLE_HEIGHT = 44;
const ITEM_HEIGHT = 32;
const ITEM_GAP = 8;
const ITEM_INSET = 20;

export const MATRIX_MAX_ROOTS = 4;
export const MATRIX_GRID_WIDTH = QUADRANT_SIZE * 2 + QUADRANT_GAP;
export const MATRIX_GRID_HEIGHT = QUADRANT_SIZE * 2 + QUADRANT_GAP;

// Natural reading order: top-left, top-right, bottom-left, bottom-right
// (doc/spec.md §6.2.1).
const QUADRANT_OFFSETS = [
  { x: 0, y: 0 },
  { x: QUADRANT_SIZE + QUADRANT_GAP, y: 0 },
  { x: 0, y: QUADRANT_SIZE + QUADRANT_GAP },
  { x: QUADRANT_SIZE + QUADRANT_GAP, y: QUADRANT_SIZE + QUADRANT_GAP },
];

// 4 quadrants fixed; a 5th+ root is defensively ignored here even though the
// UI is expected to disable adding one once there are already 4 (§6.2.1).
// Only 2 levels are meaningful (quadrant, item); anything deeper is ignored.
export function layoutMatrix(outline: OutlineNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  const quadrants = outline.slice(0, MATRIX_MAX_ROOTS);

  quadrants.forEach((quadrant, i) => {
    const offset = QUADRANT_OFFSETS[i];
    // Background square first, so it gets a lower zIndex than the title/item
    // labels and renders underneath them (see regenerateBlockShapes in
    // sync.ts) - without it, only the title's own small box was ever drawn,
    // leaving each quadrant looking like a thin bar over empty space instead
    // of a square.
    result.push({
      nodeIds: [quadrant.id],
      text: "",
      depth: 0,
      x: offset.x,
      y: offset.y,
      width: QUADRANT_SIZE,
      height: QUADRANT_SIZE,
      kind: "rect",
    });

    result.push({
      nodeIds: [quadrant.id],
      text: quadrant.text,
      depth: 0,
      x: offset.x,
      y: offset.y,
      width: QUADRANT_SIZE,
      height: TITLE_HEIGHT,
    });

    quadrant.children.forEach((item, j) => {
      result.push({
        nodeIds: [item.id],
        text: item.text,
        depth: 1,
        x: offset.x + ITEM_INSET,
        y: offset.y + TITLE_HEIGHT + j * (ITEM_HEIGHT + ITEM_GAP),
        width: QUADRANT_SIZE - ITEM_INSET * 2,
        height: ITEM_HEIGHT,
      });
    });
  });

  return result;
}

export interface MatrixAxisParams {
  axisXLabel?: string;
  axisYLabel?: string;
}

export interface AxisLabelLayout {
  key: keyof MatrixAxisParams;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const AXIS_LABEL_WIDTH = 160;
const AXIS_LABEL_HEIGHT = 28;

// Axis labels aren't expressed in the outline text (doc/spec.md §6.2.1) - they
// come from StructuredBlock.params and are laid out around the fixed grid.
export function layoutMatrixAxisLabels(params: MatrixAxisParams): AxisLabelLayout[] {
  const result: AxisLabelLayout[] = [];
  if (params.axisXLabel?.trim()) {
    result.push({
      key: "axisXLabel",
      text: params.axisXLabel,
      x: MATRIX_GRID_WIDTH / 2 - AXIS_LABEL_WIDTH / 2,
      y: -AXIS_LABEL_HEIGHT - 16,
      width: AXIS_LABEL_WIDTH,
      height: AXIS_LABEL_HEIGHT,
    });
  }
  if (params.axisYLabel?.trim()) {
    result.push({
      key: "axisYLabel",
      text: params.axisYLabel,
      x: -AXIS_LABEL_WIDTH - 16,
      y: MATRIX_GRID_HEIGHT / 2 - AXIS_LABEL_HEIGHT / 2,
      width: AXIS_LABEL_WIDTH,
      height: AXIS_LABEL_HEIGHT,
    });
  }
  return result;
}
