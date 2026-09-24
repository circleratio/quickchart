import type { OutlineNode } from "../model/document";
import type { LayoutNode } from "./treeLayout";

const TILE_WIDTH = 220;
const TILE_HEIGHT = 220;
// The white seam between tiles (the reference image's grid lines are just
// the page showing through). neutralPanelStyle's 2px border eats 1px into it
// on each side, leaving a ~4px visible seam.
const TILE_GAP = 6;

const TITLE_HEIGHT = 36;
const TITLE_WIDTH = 440;
const TITLE_FONT_SIZE = 20;
// Space between the title's underline and the grid below it.
const TITLE_GAP = 20;

// The vertical axis's name sits in a tall pill left of the row labels; the
// horizontal axis's name in a wide pill below the column labels.
const PILL_THICKNESS = 72;
const PILL_FONT_SIZE = 20;
const AXIS_LABEL_SIZE = 64;
const AXIS_LABEL_FONT_SIZE = 22;
const AXIS_LABEL_GAP = 8;

// "N×Nマトリクス" (doc/spec.md §6.2.16): an empty grid of gray tiles with
// labeled axes, for the user to draw on top of - the tiles hold no content of
// their own. The outline is fixed at two root nodes (sync.ts prefills both):
// root[0] is the horizontal axis (its text is the axis name, its children the
// column labels, left to right) and root[1] the vertical axis (its children
// the row labels, top to bottom). The grid has one column per column label
// and one row per row label. `title` (params.title) is drawn above the grid,
// underlined.
export function layoutGridMatrix(outline: OutlineNode[], title: string): LayoutNode[] {
  const [xAxis, yAxis] = outline;
  const columns = xAxis?.children ?? [];
  const rows = yAxis?.children ?? [];
  const shapes: LayoutNode[] = [];
  const labels: LayoutNode[] = [];

  const trimmedTitle = title.trim();
  const gridY = trimmedTitle ? TITLE_HEIGHT + TITLE_GAP : 0;
  const gridX = PILL_THICKNESS + AXIS_LABEL_GAP + AXIS_LABEL_SIZE + AXIS_LABEL_GAP;
  const gridWidth = columns.length * TILE_WIDTH + Math.max(0, columns.length - 1) * TILE_GAP;
  const gridHeight = rows.length * TILE_HEIGHT + Math.max(0, rows.length - 1) * TILE_GAP;
  const colX = (i: number) => gridX + i * (TILE_WIDTH + TILE_GAP);
  const rowY = (j: number) => gridY + j * (TILE_HEIGHT + TILE_GAP);

  if (trimmedTitle) {
    labels.push({
      nodeIds: [],
      text: trimmedTitle,
      depth: 0,
      x: 0,
      y: 0,
      width: TITLE_WIDTH,
      height: TITLE_HEIGHT,
      kind: "label",
      align: "left",
      fontSize: TITLE_FONT_SIZE,
      fontWeight: "bold",
      textColorSlot: 0,
    });
    shapes.push({ nodeIds: [], text: "", depth: 0, x: 0, y: TITLE_HEIGHT, width: TITLE_WIDTH, height: 0, kind: "line", dashed: false });
  }

  // Tiles are pure structure, not tied to any outline node - always
  // regenerated with the rest of the block (isFullyRelayoutedPattern in
  // sync.ts).
  rows.forEach((_, j) => {
    columns.forEach((_, i) => {
      shapes.push({
        nodeIds: [],
        text: "",
        depth: 0,
        x: colX(i),
        y: rowY(j),
        width: TILE_WIDTH,
        height: TILE_HEIGHT,
        kind: "rect",
        neutralFill: true,
      });
    });
  });

  columns.forEach((column, i) => {
    labels.push({
      nodeIds: [column.id],
      text: column.text,
      depth: 1,
      x: colX(i),
      y: gridY + gridHeight + AXIS_LABEL_GAP,
      width: TILE_WIDTH,
      height: AXIS_LABEL_SIZE,
      kind: "label",
      align: "center",
      fontSize: AXIS_LABEL_FONT_SIZE,
    });
  });
  rows.forEach((row, j) => {
    labels.push({
      nodeIds: [row.id],
      text: row.text,
      depth: 1,
      x: PILL_THICKNESS + AXIS_LABEL_GAP,
      y: rowY(j),
      width: AXIS_LABEL_SIZE,
      height: TILE_HEIGHT,
      kind: "label",
      align: "center",
      fontSize: AXIS_LABEL_FONT_SIZE,
    });
  });

  if (xAxis && columns.length > 0) {
    const y = gridY + gridHeight + AXIS_LABEL_GAP + AXIS_LABEL_SIZE + AXIS_LABEL_GAP;
    shapes.push({
      nodeIds: [],
      text: "",
      depth: 0,
      x: gridX,
      y,
      width: gridWidth,
      height: PILL_THICKNESS,
      kind: "rect",
      fillColorSlot: 3,
      cornerRadius: PILL_THICKNESS / 2,
    });
    labels.push({
      nodeIds: [xAxis.id],
      text: xAxis.text,
      depth: 0,
      x: gridX,
      y,
      width: gridWidth,
      height: PILL_THICKNESS,
      kind: "label",
      align: "center",
      fontSize: PILL_FONT_SIZE,
      fontWeight: "bold",
      contrastBgColorSlot: 3,
    });
  }

  if (yAxis && rows.length > 0) {
    shapes.push({
      nodeIds: [],
      text: "",
      depth: 0,
      x: 0,
      y: gridY,
      width: PILL_THICKNESS,
      height: gridHeight,
      kind: "rect",
      fillColorSlot: 3,
      cornerRadius: PILL_THICKNESS / 2,
    });
    // No vertical writing mode for text shapes, so the name is a horizontal
    // label rotated to read bottom-to-top. Its unrotated box is the pill's
    // box turned sideways, centered on the same point, so rotating it around
    // its own center (ShapeRenderer's rotationTransform) lands it on the pill.
    const cx = PILL_THICKNESS / 2;
    const cy = gridY + gridHeight / 2;
    labels.push({
      nodeIds: [yAxis.id],
      text: yAxis.text,
      depth: 0,
      x: cx - gridHeight / 2,
      y: cy - PILL_THICKNESS / 2,
      width: gridHeight,
      height: PILL_THICKNESS,
      kind: "label",
      align: "center",
      fontSize: PILL_FONT_SIZE,
      fontWeight: "bold",
      contrastBgColorSlot: 3,
      rotation: -90,
    });
  }

  // Tiles/pills first, so every label renders on top of them (see
  // regenerateBlockShapes in sync.ts).
  return [...shapes, ...labels];
}
