import { v4 as uuidv4 } from "uuid";
import type { Document, OutlineNode, StructuredBlock } from "../model/document";
import { DEFAULT_LAYER_ID } from "../model/document";
import type { LineShape, Shape, ShapeId, TextShape } from "../model/shape";
import {
  contrastTextColor,
  defaultShapeStyle,
  filledShapeStyle,
  getColorTheme,
  headingStyle,
  labelStyle,
  outlineStyle,
  resolveColorSlot,
  neutralPanelStyle,
  ruleStyle,
  separatorStyle,
  timelineTrackStyle,
  treeConnectorStyle,
} from "../model/style";
import type { ShapeStyle } from "../model/style";
import { layoutPyramid } from "./pyramid";
import { layoutLogicTree } from "./logicTree";
import { layoutMatrix, layoutMatrixAxisLabels } from "./matrix";
import type { MatrixAxisParams } from "./matrix";
import { layoutVenn, VENN_MAX_SETS, VENN_MIN_SETS } from "./venn";
import { layoutHeadingBullets } from "./headingBullets";
import { layoutBulletMatrix } from "./bulletMatrix";
import { layoutPyramidChart } from "./pyramidChart";
import { layoutSchedule } from "./schedule";
import type { Milestone, ScheduleParams } from "./schedule";
import { layoutVerticalFlow } from "./verticalFlow";
import { layoutHorizontalFlow } from "./horizontalFlow";
import { layoutFlowSchedule } from "./flowSchedule";
import { layoutFlowScheduleHorizontal } from "./flowScheduleHorizontal";
import { layoutTimeline } from "./timeline";
import { layoutBeforeAfter } from "./beforeAfter";
import type { LayoutNode } from "./treeLayout";

// All functions here take a plain Document and return a new plain Document -
// no Immer/store dependency, so they're directly unit-testable. documentStore
// wires them into the Undo/Redo-tracked change() helper (see doc/spec.md §6.3).

// Patterns whose shape positions are fully determined by the current outline
// as a whole (fixed quadrant slots / text-based set-membership grouping)
// rather than by incremental placement relative to one reference shape.
// Every outline edit regenerates all of their shapes from scratch instead of
// the pyramid/logicTree incremental add/delete path (see regenerateBlockShapes
// below and doc/spec.md §6.2.1/§6.2.2).
function isFullyRelayoutedPattern(pattern: StructuredBlock["pattern"]): boolean {
  return (
    pattern === "matrix" ||
    pattern === "venn" ||
    pattern === "headingBullets" ||
    pattern === "bulletMatrix" ||
    pattern === "pyramidChart" ||
    pattern === "schedule" ||
    pattern === "verticalFlow" ||
    pattern === "horizontalFlow" ||
    pattern === "flowSchedule" ||
    pattern === "flowScheduleHorizontal" ||
    pattern === "timeline" ||
    pattern === "beforeAfter"
  );
}

function vennSetCount(params: Record<string, unknown>): number {
  const raw = params.setCount;
  const n = typeof raw === "number" ? raw : VENN_MAX_SETS;
  return Math.max(VENN_MIN_SETS, Math.min(VENN_MAX_SETS, n));
}

// bulletMatrix's column headers live in params, not the outline text itself
// (doc/spec.md §6.2.4, same reasoning as matrix.ts's axis labels).
function bulletMatrixColumnHeaders(params: Record<string, unknown>): string[] {
  const raw = params.columnHeaders;
  return Array.isArray(raw) ? raw.filter((h): h is string => typeof h === "string") : [];
}

// pyramidChart's table column headers (doc/spec.md §6.2.5) - same shape and
// reasoning as bulletMatrix's above, just a separate function since the two
// patterns' params are otherwise unrelated.
function pyramidChartColumnHeaders(params: Record<string, unknown>): string[] {
  const raw = params.columnHeaders;
  return Array.isArray(raw) ? raw.filter((h): h is string => typeof h === "string") : [];
}

function pyramidChartTitle(params: Record<string, unknown>): string {
  return typeof params.title === "string" ? params.title : "";
}

// flowSchedule's overall title (doc/spec.md §6.2.9) - same params.title shape
// and reasoning as pyramidChart's above (kept separate since the two
// patterns are otherwise unrelated in this file).
function flowScheduleTitle(params: Record<string, unknown>): string {
  return typeof params.title === "string" ? params.title : "";
}

// flowScheduleHorizontal shares flowSchedule's exact params.title shape
// (doc/spec.md §6.2.10).
function flowScheduleHorizontalTitle(params: Record<string, unknown>): string {
  return typeof params.title === "string" ? params.title : "";
}

// timeline shares the same params.title shape (doc/spec.md §6.2.11).
function timelineTitle(params: Record<string, unknown>): string {
  return typeof params.title === "string" ? params.title : "";
}

const SCHEDULE_DEFAULT_TODAY = new Date();
const SCHEDULE_DEFAULT_YEAR = SCHEDULE_DEFAULT_TODAY.getFullYear();
const SCHEDULE_DEFAULT_START_MONTH = SCHEDULE_DEFAULT_TODAY.getMonth() + 1; // Date's month is 0-indexed
const SCHEDULE_DEFAULT_COLUMN_COUNT = 6;

// schedule's month range/milestones/dependency links all live in params, not
// the outline (doc/spec.md §6.2.6) - same reasoning as bulletMatrix's column
// headers (none of them have a natural position in the row/bar tree).
// Defaults start from this month so a freshly added block renders something
// immediately relevant before the user sets real values.
function scheduleParams(params: Record<string, unknown>): ScheduleParams {
  const startYear = typeof params.startYear === "number" ? params.startYear : SCHEDULE_DEFAULT_YEAR;
  const rawStartMonth = typeof params.startMonth === "number" ? params.startMonth : SCHEDULE_DEFAULT_START_MONTH;
  const startMonth = Math.min(12, Math.max(1, rawStartMonth));
  const rawColumnCount = typeof params.columnCount === "number" ? params.columnCount : SCHEDULE_DEFAULT_COLUMN_COUNT;
  const columnCount = Math.max(1, Math.round(rawColumnCount));
  const milestones = Array.isArray(params.milestones)
    ? params.milestones.filter((m): m is Milestone => typeof m === "object" && m !== null && typeof m.date === "string" && typeof m.label === "string")
    : [];
  const connections =
    typeof params.connections === "object" && params.connections !== null && !Array.isArray(params.connections)
      ? Object.fromEntries(
          Object.entries(params.connections as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        )
      : {};
  return { startYear, startMonth, columnCount, milestones, connections };
}

function layoutFor(pattern: StructuredBlock["pattern"], outline: OutlineNode[], params: Record<string, unknown> = {}): LayoutNode[] {
  const nodes = rawLayoutFor(pattern, outline, params);
  // venn.ts's circle-centered layout, and bulletMatrix's column headers
  // (placed above row 0), can both produce negative coordinates (see
  // normalizeToOrigin below); matrix.ts reserves its own fixed,
  // always-non-negative margin for axis labels (AXIS_MARGIN_X/Y) that must
  // stay intact, and pyramid/logicTree's cursor-based placement already
  // starts at (0, 0), so normalizing them here would be a no-op at best.
  return pattern === "venn" || pattern === "bulletMatrix" || pattern === "pyramidChart" || pattern === "schedule"
    ? normalizeToOrigin(nodes)
    : nodes;
}

function rawLayoutFor(pattern: StructuredBlock["pattern"], outline: OutlineNode[], params: Record<string, unknown>): LayoutNode[] {
  switch (pattern) {
    case "pyramid":
      return layoutPyramid(outline);
    case "logicTree":
      return layoutLogicTree(outline);
    case "matrix":
      return layoutMatrix(outline);
    case "venn":
      return layoutVenn(outline, vennSetCount(params));
    case "headingBullets":
      return layoutHeadingBullets(outline);
    case "bulletMatrix":
      return layoutBulletMatrix(outline, bulletMatrixColumnHeaders(params));
    case "pyramidChart":
      return layoutPyramidChart(outline, pyramidChartColumnHeaders(params), pyramidChartTitle(params));
    case "schedule":
      return layoutSchedule(outline, scheduleParams(params));
    case "verticalFlow":
      return layoutVerticalFlow(outline);
    case "horizontalFlow":
      return layoutHorizontalFlow(outline);
    case "flowSchedule":
      return layoutFlowSchedule(outline, flowScheduleTitle(params));
    case "flowScheduleHorizontal":
      return layoutFlowScheduleHorizontal(outline, flowScheduleHorizontalTitle(params));
    case "timeline":
      return layoutTimeline(outline, timelineTitle(params));
    case "beforeAfter":
      return layoutBeforeAfter(outline);
    default:
      return [];
  }
}

// Every caller treats a LayoutNode's (x, y) as an offset added to the block's
// placement origin (originOfBlock below), which assumes the layout's own
// minimum x/y is 0 - true for pyramid/logicTree/matrix's cursor-based
// placement, but not for venn.ts, whose circle layout is centered on (0, 0)
// and so spans negative coordinates. Shifting every node so the layout's own
// bounding box starts at (0, 0) keeps that assumption true for any pattern,
// instead of each pattern having to know about it.
function normalizeToOrigin(nodes: LayoutNode[]): LayoutNode[] {
  if (nodes.length === 0) return nodes;
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  if (minX === 0 && minY === 0) return nodes;
  return nodes.map((n) => ({ ...n, x: n.x - minX, y: n.y - minY }));
}

// Resolves a LayoutNode's full ShapeStyle: a base style from its `kind`
// (falling back to defaultShapeStyle's bordered box for "text"/undefined),
// with fontWeight/italic/underline/textColorSlot layered on top where set -
// decorations a kind's own style function doesn't hardcode, so a pattern can
// reuse a kind (e.g. "label") with a different look per LayoutNode instead of
// every decoration combination needing its own kind (see treeLayout.ts).
function styleFor(themeId: string, layoutNode: LayoutNode): ShapeStyle {
  const theme = getColorTheme(themeId);
  const base: ShapeStyle =
    layoutNode.kind === "ellipse" || layoutNode.kind === "rect"
      ? layoutNode.fillColorSlot !== undefined
        ? filledShapeStyle(themeId, layoutNode.fillColorSlot)
        : layoutNode.neutralFill
          ? neutralPanelStyle()
          : outlineStyle(themeId, layoutNode.dashed === true)
      : layoutNode.kind === "line"
        ? layoutNode.trackStyle
          ? timelineTrackStyle()
          : layoutNode.dashed === false
            ? ruleStyle(themeId)
            : separatorStyle(themeId)
        : layoutNode.kind === "label"
          ? labelStyle(themeId, layoutNode.fontSize)
          : layoutNode.kind === "heading" || layoutNode.kind === "polygon"
            ? headingStyle(themeId, layoutNode.fontSize, layoutNode.fillColorSlot)
            : defaultShapeStyle(themeId);
  return {
    ...base,
    ...(layoutNode.fontWeight ? { fontWeight: layoutNode.fontWeight } : {}),
    ...(layoutNode.italic ? { fontStyle: "italic" as const } : {}),
    ...(layoutNode.underline ? { textDecoration: "underline" as const } : {}),
    ...(layoutNode.textColorSlot !== undefined ? { textColor: resolveColorSlot(theme, layoutNode.textColorSlot) } : {}),
    ...(layoutNode.contrastBgColorSlot !== undefined
      ? { textColor: contrastTextColor(theme, resolveColorSlot(theme, layoutNode.contrastBgColorSlot)) }
      : {}),
  };
}

function findBlock(doc: Document, blockId: string): StructuredBlock | undefined {
  return doc.structuredBlocks.find((b) => b.id === blockId);
}

function findNode(nodes: OutlineNode[], nodeId: string): OutlineNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const found = findNode(node.children, nodeId);
    if (found) return found;
  }
  return undefined;
}

interface SiblingLocation {
  parentId: string | null;
  siblings: OutlineNode[];
  index: number;
}

function getSiblingsAndIndex(nodes: OutlineNode[], nodeId: string, parentId: string | null = null): SiblingLocation | undefined {
  const index = nodes.findIndex((n) => n.id === nodeId);
  if (index !== -1) return { parentId, siblings: nodes, index };
  for (const node of nodes) {
    const found = getSiblingsAndIndex(node.children, nodeId, node.id);
    if (found) return found;
  }
  return undefined;
}

// Rebuilds the tree with `parentId`'s children array (or the root array, for
// parentId null) replaced by `updater(currentChildren)`.
function updateChildren(nodes: OutlineNode[], parentId: string | null, updater: (children: OutlineNode[]) => OutlineNode[]): OutlineNode[] {
  if (parentId === null) return updater(nodes);
  return nodes.map((node) =>
    node.id === parentId
      ? { ...node, children: updater(node.children) }
      : { ...node, children: updateChildren(node.children, parentId, updater) },
  );
}

function mapOutline(nodes: OutlineNode[], fn: (node: OutlineNode) => OutlineNode): OutlineNode[] {
  return nodes.map((node) => {
    const updated = fn(node);
    return { ...updated, children: mapOutline(updated.children, fn) };
  });
}

function collectSubtreeIds(node: OutlineNode): string[] {
  return [node.id, ...node.children.flatMap(collectSubtreeIds)];
}

function removeNodeFromTree(nodes: OutlineNode[], nodeId: string): OutlineNode[] {
  return nodes.filter((n) => n.id !== nodeId).map((n) => ({ ...n, children: removeNodeFromTree(n.children, nodeId) }));
}

function findShapeForNode(doc: Document, block: StructuredBlock, nodeId: string): Shape | undefined {
  for (const shapeId of block.generatedShapeIds) {
    const shape = doc.shapes[shapeId];
    if (shape?.templateNodeIds?.includes(nodeId)) return shape;
  }
  return undefined;
}

// Which of the two tree patterns (doc/spec.md §6.2) draws parent-child
// connector lines, and along which axis: "down" for pyramid/ツリー図 (roots on
// top, children below), "right" for logicTree/ロジックツリー (roots on the
// left, children extending rightward) - matches treeLayout.ts's own
// `direction`. Anything else (the fixed-hierarchy patterns) doesn't.
function treeConnectorDirection(pattern: StructuredBlock["pattern"]): "down" | "right" | undefined {
  if (pattern === "pyramid") return "down";
  if (pattern === "logicTree") return "right";
  return undefined;
}

function toLineShapes(segments: Array<[number, number, number, number]>, zIndexStart: number): LineShape[] {
  const style = treeConnectorStyle();
  return segments.map(([x1, y1, x2, y2], i) => ({
    id: uuidv4(),
    type: "line",
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    rotation: 0,
    style,
    zIndex: zIndexStart + i,
    templateNodeIds: [],
  }));
}

// One parent's worth of elbow-jointed connector lines: a stub from the
// parent's own edge (bottom-center for "down", right-center for "right"), a
// "bus" spanning its children's centers on the cross axis (skipped when
// there's only one child, since it would have zero length), then a stub from
// the bus into each child's facing edge-center - the typical org-chart/
// tree-diagram look (see the ツリー図 reference image this was built from).
// The bus sits halfway between the parent's edge and its (nearest, in case
// children ended up unevenly placed) child's facing edge, so the two stubs
// on the primary axis always come out equal length, rather than at a fixed
// distance from the parent that reads as off-center whenever the gap between
// rows/columns isn't exactly double that fixed distance. Untracked
// (`templateNodeIds: []`, same convention as bulletMatrix's grid lines):
// purely structural, not tied to a specific outline node.
function elbowConnectorShapes(parent: Shape, children: Shape[], zIndexStart: number, direction: "down" | "right"): LineShape[] {
  if (direction === "right") {
    const parentAnchorX = parent.x + parent.width;
    const parentAnchorY = parent.y + parent.height / 2;
    const nearestChildLeftX = Math.min(...children.map((c) => c.x));
    const branchX = parentAnchorX + (nearestChildLeftX - parentAnchorX) / 2;
    const childCenterYs = children.map((c) => c.y + c.height / 2);
    const topY = Math.min(...childCenterYs);
    const bottomY = Math.max(...childCenterYs);

    const segments: Array<[number, number, number, number]> = [[parentAnchorX, parentAnchorY, branchX, parentAnchorY]];
    if (bottomY > topY) segments.push([branchX, topY, branchX, bottomY]);
    for (const child of children) {
      const cy = child.y + child.height / 2;
      segments.push([branchX, cy, child.x, cy]);
    }
    return toLineShapes(segments, zIndexStart);
  }

  const parentAnchorX = parent.x + parent.width / 2;
  const parentAnchorY = parent.y + parent.height;
  const nearestChildTopY = Math.min(...children.map((c) => c.y));
  const branchY = parentAnchorY + (nearestChildTopY - parentAnchorY) / 2;
  const childCenterXs = children.map((c) => c.x + c.width / 2);
  const leftX = Math.min(...childCenterXs);
  const rightX = Math.max(...childCenterXs);

  const segments: Array<[number, number, number, number]> = [[parentAnchorX, parentAnchorY, parentAnchorX, branchY]];
  if (rightX > leftX) segments.push([leftX, branchY, rightX, branchY]);
  for (const child of children) {
    const cx = child.x + child.width / 2;
    segments.push([cx, branchY, cx, child.y]);
  }
  return toLineShapes(segments, zIndexStart);
}

// Rebuilds every parent-child connector line for a "pyramid"/"logicTree"
// (ツリー図/ロジックツリー) block, deriving each one from the CURRENT actual
// position of its parent/child shapes - not from treeLayout.ts's idealized
// cursor layout, which these patterns' incremental add/delete placement
// (buildNodeShape above) doesn't necessarily match (and which manual
// repositioning on the canvas would diverge from anyway). Called after every
// structural edit (add/delete/indent/outdent/move/bulk-import - see each
// call site below); a no-op for any other pattern. Old connectors are
// tracked via params._treeConnectorShapeIds (same "untracked shape, own
// params slot" convention as matrix's _axisShapeIds) and always fully
// discarded and redrawn rather than diffed, since a single child add/remove
// can change where the bus needs to start/end.
function regenerateTreeConnectors(doc: Document, blockId: string): Document {
  const block = findBlock(doc, blockId);
  const maybeDirection = block && treeConnectorDirection(block.pattern);
  if (!block || !maybeDirection) return doc;
  const direction: "down" | "right" = maybeDirection;

  const oldIds = (block.params._treeConnectorShapeIds as ShapeId[] | undefined) ?? [];
  const oldIdSet = new Set(oldIds);
  const shapes = { ...doc.shapes };
  for (const id of oldIds) delete shapes[id];

  function shapeFor(nodeId: string): Shape | undefined {
    for (const shapeId of block!.generatedShapeIds) {
      if (oldIdSet.has(shapeId)) continue;
      const shape = shapes[shapeId];
      if (shape?.templateNodeIds?.includes(nodeId)) return shape;
    }
    return undefined;
  }

  const newShapes: LineShape[] = [];
  function walk(node: OutlineNode) {
    if (node.children.length > 0) {
      const parentShape = shapeFor(node.id);
      const childShapes = node.children.map((c) => shapeFor(c.id)).filter((s): s is Shape => Boolean(s));
      if (parentShape && childShapes.length > 0) {
        newShapes.push(
          ...elbowConnectorShapes(parentShape, childShapes, Object.keys(shapes).length + newShapes.length, direction),
        );
      }
    }
    for (const child of node.children) walk(child);
  }
  for (const root of block.outline) walk(root);

  for (const s of newShapes) shapes[s.id] = s;
  const newIds = newShapes.map((s) => s.id);

  const layers = doc.layers.map((layer) =>
    layer.id === DEFAULT_LAYER_ID
      ? { ...layer, shapeIds: [...layer.shapeIds.filter((id) => !oldIdSet.has(id)), ...newIds] }
      : layer,
  );

  return withBlock({ ...doc, shapes, layers }, blockId, (b) => ({
    ...b,
    params: { ...b.params, _treeConnectorShapeIds: newIds },
    generatedShapeIds: [...b.generatedShapeIds.filter((id) => !oldIdSet.has(id)), ...newIds],
  }));
}

function appendShapeToDocument(doc: Document, shape: Shape): Pick<Document, "shapes" | "layers"> {
  return {
    shapes: { ...doc.shapes, [shape.id]: shape },
    layers: doc.layers.map((layer) =>
      layer.id === DEFAULT_LAYER_ID ? { ...layer, shapeIds: [...layer.shapeIds, shape.id] } : layer,
    ),
  };
}

const DEFAULT_NODE_WIDTH = 160;
const DEFAULT_NODE_HEIGHT = 60;
// Visual gap for incremental placement's offsets below - matches
// pyramid.ts's/logicTree.ts's own layoutTree GAP, so a tree built via the
// primary node-by-node UI reads with the same rhythm as one built via bulk
// import (which goes through that GAP directly - see rawLayoutFor above).
const TREE_NODE_GAP = 36;

// Position offset for a newly-added node's shape, relative to a reference
// shape (the parent, for a new child; the preceding sibling, for a new
// sibling) - sized from the REFERENCE shape's own current width/height, not
// a fixed total offset baked in for the original 160x60 default. A fixed
// total offset (this function's previous approach) produces a visual gap
// that only comes out to TREE_NODE_GAP when every node happens to still be
// exactly the default size; once a reference node's size differs (a manual
// resize, or - as reported - a tree built up over several sessions whose
// underlying constants changed between them, since each shape's offset was
// permanently baked in at creation time) neighboring gaps stop matching each
// other, which is what "the gap between two siblings is way bigger than
// another pair" (the reported bug) looks like. Direction depends on the
// pattern's layout axis (doc/spec.md §6.3).
function newNodeOffset(pattern: StructuredBlock["pattern"], relation: "child" | "sibling", referenceShape: Shape | undefined): { x: number; y: number } {
  const down = pattern !== "logicTree";
  const refWidth = referenceShape?.width ?? DEFAULT_NODE_WIDTH;
  const refHeight = referenceShape?.height ?? DEFAULT_NODE_HEIGHT;
  if (relation === "child") return down ? { x: 0, y: refHeight + TREE_NODE_GAP } : { x: refWidth + TREE_NODE_GAP, y: 0 };
  return down ? { x: refWidth + TREE_NODE_GAP, y: 0 } : { x: 0, y: refHeight + TREE_NODE_GAP };
}

function buildNodeShape(
  doc: Document,
  block: StructuredBlock,
  newNode: OutlineNode,
  referenceNodeId: string | undefined,
  relation: "child" | "sibling",
): TextShape {
  const referenceShape = referenceNodeId ? findShapeForNode(doc, block, referenceNodeId) : undefined;
  const offset = newNodeOffset(block.pattern, relation, referenceShape);
  const position = referenceShape
    ? { x: referenceShape.x + offset.x, y: referenceShape.y + offset.y }
    : { x: 40, y: 40 };

  return {
    id: uuidv4(),
    type: "text",
    x: position.x,
    y: position.y,
    width: referenceShape?.width ?? DEFAULT_NODE_WIDTH,
    height: referenceShape?.height ?? DEFAULT_NODE_HEIGHT,
    rotation: 0,
    style: defaultShapeStyle(doc.colorThemeId),
    zIndex: Object.keys(doc.shapes).length,
    templateNodeIds: [newNode.id],
    content: newNode.text,
    align: "center",
  };
}

function withBlock(doc: Document, blockId: string, updater: (block: StructuredBlock) => StructuredBlock): Document {
  return {
    ...doc,
    structuredBlocks: doc.structuredBlocks.map((b) => (b.id === blockId ? updater(b) : b)),
  };
}

// --- Public API ---------------------------------------------------------

export function addEmptyStructuredBlock(doc: Document, pattern: StructuredBlock["pattern"]): { document: Document; blockId: string } {
  const block: StructuredBlock = { id: uuidv4(), pattern, outline: [], params: {}, generatedShapeIds: [] };
  return { document: { ...doc, structuredBlocks: [...doc.structuredBlocks, block] }, blockId: block.id };
}

// A bulletMatrix row (root outline node) needs one empty cell per
// params.columnHeaders up front - otherwise a freshly-added row would render
// with a heading and zero cells, and the generic outline editor has no way to
// know it should add exactly columnHeaders.length children to fill them in.
// Only used for a ROOT-level add (see addFirstOutlineNode/addOutlineSibling
// below); a cell/title/detail added via addOutlineChild needs no such
// prefill, since those levels don't have a fixed expected child count.
function emptyBulletMatrixRow(block: StructuredBlock): OutlineNode {
  return {
    id: uuidv4(),
    text: "",
    children: bulletMatrixColumnHeaders(block.params).map(() => ({ id: uuidv4(), text: "", children: [] })),
  };
}

// A pyramidChart row (root outline node) needs one "scale" child plus one
// empty cell per params.columnHeaders up front, for the same reason
// emptyBulletMatrixRow above does - see pyramidChart.ts for the fixed
// child[0]=scale, child[1..]=columnHeaders position mapping.
function emptyPyramidChartRow(block: StructuredBlock): OutlineNode {
  return {
    id: uuidv4(),
    text: "",
    children: [
      { id: uuidv4(), text: "", children: [] },
      ...pyramidChartColumnHeaders(block.params).map(() => ({ id: uuidv4(), text: "", children: [] })),
    ],
  };
}

// A verticalFlow step (root outline node) needs its badge child (child[0],
// see verticalFlow.ts) up front for the same reason emptyPyramidChartRow
// above does - without it, a freshly-added step would have no badge-shaped
// slot for the generic outline editor to fill in (its "+子" just appends a
// plain node, which would land at position 0 and be misread as the badge
// only by accident of ordering). Unlike pyramidChart's cells, description
// lines (child[1..]) have no fixed count, so only the badge is prefilled.
function emptyVerticalFlowStep(): OutlineNode {
  return { id: uuidv4(), text: "", children: [{ id: uuidv4(), text: "", children: [] }] };
}

// A timeline event (root outline node) needs its time child (child[0], see
// timeline.ts) up front for the same reason emptyVerticalFlowStep above does.
function emptyTimelineEvent(): OutlineNode {
  return { id: uuidv4(), text: "", children: [{ id: uuidv4(), text: "", children: [] }] };
}

// A beforeAfter topic (root outline node) needs both its ASIS and TOBE
// blocks (child[0]/child[1], see beforeAfter.ts) up front for the same
// reason emptyPyramidChartRow above does - without them, a freshly-added
// topic would have no ASIS/TOBE-shaped slots for the generic outline editor
// to fill in. The topic's own text (unlike bulletMatrix's/pyramidChart's
// root text) IS used directly - it's the badge (beforeAfter.ts) - so, unlike
// those two, no further per-child prefill is needed here.
function emptyBeforeAfterTopic(): OutlineNode {
  return {
    id: uuidv4(),
    text: "",
    children: [
      { id: uuidv4(), text: "", children: [] },
      { id: uuidv4(), text: "", children: [] },
    ],
  };
}

// A schedule bar's 2 children are position-based like pyramidChart's
// scale/cells (doc/spec.md §6.2.6): child[0]=start date, child[1]=end date,
// both "YYYY-MM-DD" strings entered via dedicated date inputs rather than
// free text (see schedule.ts's dateToGridX).
function emptyScheduleBar(): OutlineNode {
  return {
    id: uuidv4(),
    text: "",
    children: [
      { id: uuidv4(), text: "", children: [] },
      { id: uuidv4(), text: "", children: [] },
    ],
  };
}

// A schedule row needs one bar up front for the same reason
// emptyBulletMatrixRow/emptyPyramidChartRow above do - an empty row with zero
// bars would give the structured outline editor nothing bar-shaped to expand
// into (a "+子" on the row would add a plain 0-child node, not a proper bar).
function emptyScheduleRow(): OutlineNode {
  return { id: uuidv4(), text: "", children: [emptyScheduleBar()] };
}

function newRootNode(block: StructuredBlock): OutlineNode {
  if (block.pattern === "bulletMatrix") return emptyBulletMatrixRow(block);
  if (block.pattern === "pyramidChart") return emptyPyramidChartRow(block);
  if (block.pattern === "schedule") return emptyScheduleRow();
  if (block.pattern === "verticalFlow") return emptyVerticalFlowStep();
  if (block.pattern === "timeline") return emptyTimelineEvent();
  if (block.pattern === "beforeAfter") return emptyBeforeAfterTopic();
  return { id: uuidv4(), text: "", children: [] };
}

// addOutlineChild's own new node, prefilled the same way as newRootNode above
// when the parent is a schedule ROW (adding a new bar to it) - unlike
// newRootNode, only schedule needs this: bulletMatrix/pyramidChart's own
// depth-1 prefill only ever happens as part of adding a whole new row
// (their cell/scale counts are fixed by params, not grown one at a time).
function newChildNode(block: StructuredBlock, parentNodeId: string): OutlineNode {
  if (block.pattern === "schedule" && block.outline.some((n) => n.id === parentNodeId)) {
    return emptyScheduleBar();
  }
  return { id: uuidv4(), text: "", children: [] };
}

export function addFirstOutlineNode(doc: Document, blockId: string): Document {
  const block = findBlock(doc, blockId);
  if (!block || block.outline.length > 0) return doc;
  const newNode: OutlineNode = newRootNode(block);

  if (isFullyRelayoutedPattern(block.pattern)) {
    return regenerateBlockShapes(doc, block, [newNode]);
  }

  const shape = buildNodeShape(doc, block, newNode, undefined, "sibling");
  const { shapes, layers } = appendShapeToDocument(doc, shape);
  return withBlock({ ...doc, shapes, layers }, blockId, (b) => ({
    ...b,
    outline: [newNode],
    generatedShapeIds: [...b.generatedShapeIds, shape.id],
  }));
}

export function addOutlineChild(doc: Document, blockId: string, parentNodeId: string): Document {
  const block = findBlock(doc, blockId);
  if (!block || !findNode(block.outline, parentNodeId)) return doc;
  const newNode: OutlineNode = newChildNode(block, parentNodeId);
  const newOutline = updateChildren(block.outline, parentNodeId, (children) => [...children, newNode]);

  if (isFullyRelayoutedPattern(block.pattern)) {
    return regenerateBlockShapes(doc, block, newOutline);
  }

  const shape = buildNodeShape(doc, block, newNode, parentNodeId, "child");
  const { shapes, layers } = appendShapeToDocument(doc, shape);
  const next = withBlock({ ...doc, shapes, layers }, blockId, (b) => ({
    ...b,
    outline: newOutline,
    generatedShapeIds: [...b.generatedShapeIds, shape.id],
  }));
  return regenerateTreeConnectors(next, blockId);
}

export function addOutlineSibling(doc: Document, blockId: string, afterNodeId: string): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  const loc = getSiblingsAndIndex(block.outline, afterNodeId);
  if (!loc) return doc;

  const newNode: OutlineNode = loc.parentId === null ? newRootNode(block) : { id: uuidv4(), text: "", children: [] };
  const newOutline = updateChildren(block.outline, loc.parentId, (children) => [
    ...children.slice(0, loc.index + 1),
    newNode,
    ...children.slice(loc.index + 1),
  ]);

  if (isFullyRelayoutedPattern(block.pattern)) {
    return regenerateBlockShapes(doc, block, newOutline);
  }

  const shape = buildNodeShape(doc, block, newNode, afterNodeId, "sibling");
  const { shapes, layers } = appendShapeToDocument(doc, shape);
  const next = withBlock({ ...doc, shapes, layers }, blockId, (b) => ({
    ...b,
    outline: newOutline,
    generatedShapeIds: [...b.generatedShapeIds, shape.id],
  }));
  return regenerateTreeConnectors(next, blockId);
}

export function deleteOutlineNode(doc: Document, blockId: string, nodeId: string): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  const target = findNode(block.outline, nodeId);
  if (!target) return doc;
  const newOutline = removeNodeFromTree(block.outline, nodeId);

  if (isFullyRelayoutedPattern(block.pattern)) {
    return regenerateBlockShapes(doc, block, newOutline);
  }

  const idsToRemove = new Set(collectSubtreeIds(target));
  const shapes = { ...doc.shapes };
  const removedShapeIds: ShapeId[] = [];
  for (const shapeId of block.generatedShapeIds) {
    const shape = shapes[shapeId];
    if (shape?.templateNodeIds?.some((id) => idsToRemove.has(id))) {
      delete shapes[shapeId];
      removedShapeIds.push(shapeId);
    }
  }

  const layers = doc.layers.map((layer) => ({
    ...layer,
    shapeIds: layer.shapeIds.filter((id) => !removedShapeIds.includes(id)),
  }));

  const next = withBlock({ ...doc, shapes, layers }, blockId, (b) => ({
    ...b,
    outline: newOutline,
    generatedShapeIds: b.generatedShapeIds.filter((id) => !removedShapeIds.includes(id)),
  }));
  return regenerateTreeConnectors(next, blockId);
}

export function updateOutlineNodeText(doc: Document, blockId: string, nodeId: string, text: string): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  const newOutline = mapOutline(block.outline, (node) => (node.id === nodeId ? { ...node, text } : node));

  // Venn: a text edit can change which set-combination an element belongs
  // to, so its shape may need to move, split, or merge with another - matrix/
  // pyramid/logicTree positions never depend on text (doc/spec.md §6.2.2).
  // schedule: a bar's date fields (schedule.ts's child[0]/[1]) have no shape
  // of their own to patch in place at all - editing one determines whether
  // its bar renders, and where, so it always needs a full regenerate rather
  // than the "find the matching shape, patch its content" default below
  // (which would silently do nothing for a date field, since date fields
  // aren't rendered as shapes to begin with).
  if (block.pattern === "venn" || block.pattern === "schedule") {
    return regenerateBlockShapes(doc, block, newOutline);
  }

  const shapes = { ...doc.shapes };
  for (const shapeId of block.generatedShapeIds) {
    const shape = shapes[shapeId];
    if (shape?.type === "text" && shape.templateNodeIds?.includes(nodeId)) {
      shapes[shapeId] = { ...shape, content: text };
    }
  }

  return withBlock({ ...doc, shapes }, blockId, (b) => ({ ...b, outline: newOutline }));
}

// The other sync direction: editing a generated text shape's content directly
// on the canvas updates its outline node(s) (doc/spec.md §6.3). A no-op for
// shapes that aren't part of any structured block.
export function updateShapeContentAndSync(doc: Document, shapeId: ShapeId, content: string): Document {
  const shape = doc.shapes[shapeId];
  if (!shape || shape.type !== "text") return doc;

  const owningBlock = shape.templateNodeIds?.length
    ? doc.structuredBlocks.find((b) => b.generatedShapeIds.includes(shapeId))
    : undefined;
  if (!owningBlock) {
    return { ...doc, shapes: { ...doc.shapes, [shapeId]: { ...shape, content } } };
  }

  let outline = owningBlock.outline;
  for (const nodeId of shape.templateNodeIds!) {
    outline = mapOutline(outline, (node) => (node.id === nodeId ? { ...node, text: content } : node));
  }

  if (owningBlock.pattern === "venn") {
    return regenerateBlockShapes(doc, owningBlock, outline);
  }

  const shapes = { ...doc.shapes, [shapeId]: { ...shape, content } };
  return withBlock({ ...doc, shapes }, owningBlock.id, (b) => ({ ...b, outline }));
}

// Matrix axis labels aren't tied to outline nodes (doc/spec.md §6.2.1), so
// they're tracked via params._axisShapeIds instead of templateNodeIds; every
// call discards and regenerates them (cheap - at most 2 shapes).
export function updateMatrixAxisLabels(doc: Document, blockId: string, axisParams: MatrixAxisParams): Document {
  const block = findBlock(doc, blockId);
  if (!block || block.pattern !== "matrix") return doc;

  const shapes = { ...doc.shapes };
  const oldIds = (block.params._axisShapeIds as ShapeId[] | undefined) ?? [];
  for (const id of oldIds) delete shapes[id];

  const mergedParams = { ...block.params, ...axisParams };
  const labels = layoutMatrixAxisLabels(mergedParams);
  let origin = originOfBlock(doc, block);

  // label.x/y are deliberately negative (outside the grid, to its
  // left/above). Clamping just the label's own absolute position to >= 0
  // isn't enough on its own - a block placed near the canvas edge (the
  // default placement is (40, 40), well within the axis labels' own
  // 176x44 reach) would pull the label so far right/down that it overlaps
  // the grid instead of sitting outside it. So instead, if the grid doesn't
  // currently have enough clearance, shift every shape the block has
  // generated so it does - this only ever grows the clearance, and once
  // grown it stays (origin is derived from the shapes' own position), so
  // repeated calls don't keep shifting it further.
  const neededMinX = Math.max(0, -Math.min(0, ...labels.map((l) => l.x)));
  const neededMinY = Math.max(0, -Math.min(0, ...labels.map((l) => l.y)));
  const dx = Math.max(0, neededMinX - origin.x);
  const dy = Math.max(0, neededMinY - origin.y);
  if (dx > 0 || dy > 0) {
    for (const id of block.generatedShapeIds) {
      const s = shapes[id];
      if (s) shapes[id] = { ...s, x: s.x + dx, y: s.y + dy };
    }
    origin = { x: origin.x + dx, y: origin.y + dy };
  }

  const newIds: ShapeId[] = [];
  let zIndex = Object.keys(shapes).length;
  for (const label of labels) {
    const shape: TextShape = {
      id: uuidv4(),
      type: "text",
      x: origin.x + label.x,
      y: origin.y + label.y,
      width: label.width,
      height: label.height,
      rotation: 0,
      style: defaultShapeStyle(doc.colorThemeId),
      zIndex: zIndex++,
      content: label.text,
      align: "center",
    };
    shapes[shape.id] = shape;
    newIds.push(shape.id);
  }

  const oldIdSet = new Set(oldIds);
  const layers = doc.layers.map((layer) =>
    layer.id === DEFAULT_LAYER_ID
      ? { ...layer, shapeIds: [...layer.shapeIds.filter((id) => !oldIdSet.has(id)), ...newIds] }
      : layer,
  );

  return withBlock({ ...doc, shapes, layers }, blockId, (b) => ({
    ...b,
    params: { ...mergedParams, _axisShapeIds: newIds },
    generatedShapeIds: [...b.generatedShapeIds.filter((id) => !oldIdSet.has(id)), ...newIds],
  }));
}

// Shrinking setCount drops any roots beyond the new count (and their shapes) -
// otherwise a set the UI no longer lets you edit would linger as an orphan.
export function updateVennSetCount(doc: Document, blockId: string, setCount: number): Document {
  const block = findBlock(doc, blockId);
  if (!block || block.pattern !== "venn") return doc;
  const clamped = Math.max(VENN_MIN_SETS, Math.min(VENN_MAX_SETS, setCount));
  const newOutline = block.outline.slice(0, clamped);
  const updatedBlock: StructuredBlock = { ...block, params: { ...block.params, setCount: clamped } };
  return regenerateBlockShapes(doc, updatedBlock, newOutline);
}

// Changes bulletMatrix's column count/labels (doc/spec.md §6.2.4). Every
// row's cells are resized to match by position: a surviving column index
// keeps its existing cell (and everything under it - titles/details), a new
// column index gets a fresh empty cell, and a dropped column's cell (and its
// subtree) is discarded. Column headers have no outline node of their own
// (bulletMatrixColumnHeaders in this file), so this is the only path that
// changes them - unlike a row/cell/title/detail edit, which goes through the
// normal outline operations below.
export function updateBulletMatrixColumns(doc: Document, blockId: string, columnHeaders: string[]): Document {
  const block = findBlock(doc, blockId);
  if (!block || block.pattern !== "bulletMatrix") return doc;
  const newOutline = block.outline.map((row) => ({
    ...row,
    children: columnHeaders.map((_, i) => row.children[i] ?? { id: uuidv4(), text: "", children: [] }),
  }));
  const updatedBlock: StructuredBlock = { ...block, params: { ...block.params, columnHeaders } };
  return regenerateBlockShapes(doc, updatedBlock, newOutline);
}

// Bulk replace from a parsed Markdown document (doc/spec.md §6.2.4): unlike
// replaceOutline, bulletMatrix's column headers and outline must be set
// together in one regeneration, since layoutBulletMatrix (bulletMatrix.ts)
// needs both to position anything (see bulletMatrixColumnHeaders above).
export function replaceBulletMatrix(doc: Document, blockId: string, columnHeaders: string[], newOutline: OutlineNode[]): Document {
  const block = findBlock(doc, blockId);
  if (!block || block.pattern !== "bulletMatrix") return doc;
  const updatedBlock: StructuredBlock = { ...block, params: { ...block.params, columnHeaders } };
  return regenerateBlockShapes(doc, updatedBlock, newOutline);
}

// Changes pyramidChart's column count/labels (doc/spec.md §6.2.5). Mirrors
// updateBulletMatrixColumns above, except column 0 of each row's children is
// reserved for the "scale" label (pyramidChart.ts) and always kept, with the
// remaining children resized to match `columnHeaders` by position.
export function updatePyramidChartColumns(doc: Document, blockId: string, columnHeaders: string[]): Document {
  const block = findBlock(doc, blockId);
  if (!block || block.pattern !== "pyramidChart") return doc;
  const newOutline = block.outline.map((row) => ({
    ...row,
    children: [
      row.children[0] ?? { id: uuidv4(), text: "", children: [] },
      ...columnHeaders.map((_, i) => row.children[1 + i] ?? { id: uuidv4(), text: "", children: [] }),
    ],
  }));
  const updatedBlock: StructuredBlock = { ...block, params: { ...block.params, columnHeaders } };
  return regenerateBlockShapes(doc, updatedBlock, newOutline);
}

// pyramidChart's overall title (doc/spec.md §6.2.5) isn't tied to an outline
// node, same reasoning as matrix's axis labels/bulletMatrix's column headers.
// Unlike updateMatrixAxisLabels' incremental clearance-shifting logic, a
// title change just regenerates the whole (cheap, single-block) diagram -
// there's no equivalent "existing shapes must not overlap the new label"
// concern here since the title always sits outside/above every generated
// shape (pyramidChart.ts).
export function updatePyramidChartTitle(doc: Document, blockId: string, title: string): Document {
  const block = findBlock(doc, blockId);
  if (!block || block.pattern !== "pyramidChart") return doc;
  const updatedBlock: StructuredBlock = { ...block, params: { ...block.params, title } };
  return regenerateBlockShapes(doc, updatedBlock, block.outline);
}

// flowSchedule's overall title (doc/spec.md §6.2.9) - same reasoning as
// updatePyramidChartTitle above.
export function updateFlowScheduleTitle(doc: Document, blockId: string, title: string): Document {
  const block = findBlock(doc, blockId);
  if (!block || block.pattern !== "flowSchedule") return doc;
  const updatedBlock: StructuredBlock = { ...block, params: { ...block.params, title } };
  return regenerateBlockShapes(doc, updatedBlock, block.outline);
}

// flowScheduleHorizontal's overall title (doc/spec.md §6.2.10) - same
// reasoning as updateFlowScheduleTitle above.
export function updateFlowScheduleHorizontalTitle(doc: Document, blockId: string, title: string): Document {
  const block = findBlock(doc, blockId);
  if (!block || block.pattern !== "flowScheduleHorizontal") return doc;
  const updatedBlock: StructuredBlock = { ...block, params: { ...block.params, title } };
  return regenerateBlockShapes(doc, updatedBlock, block.outline);
}

// timeline's overall title (doc/spec.md §6.2.11) - same reasoning as
// updateFlowScheduleTitle above.
export function updateTimelineTitle(doc: Document, blockId: string, title: string): Document {
  const block = findBlock(doc, blockId);
  if (!block || block.pattern !== "timeline") return doc;
  const updatedBlock: StructuredBlock = { ...block, params: { ...block.params, title } };
  return regenerateBlockShapes(doc, updatedBlock, block.outline);
}

// schedule's month range (doc/spec.md §6.2.6) - like pyramidChart's title,
// just regenerates the whole (cheap, single-block) chart rather than
// incrementally patching header shapes, since every bar's x position also
// depends on this range and would need recomputing anyway.
export function updateScheduleMonths(
  doc: Document,
  blockId: string,
  months: { startYear: number; startMonth: number; columnCount: number },
): Document {
  const block = findBlock(doc, blockId);
  if (!block || block.pattern !== "schedule") return doc;
  const updatedBlock: StructuredBlock = { ...block, params: { ...block.params, ...months } };
  return regenerateBlockShapes(doc, updatedBlock, block.outline);
}

export function updateScheduleMilestones(doc: Document, blockId: string, milestones: Milestone[]): Document {
  const block = findBlock(doc, blockId);
  if (!block || block.pattern !== "schedule") return doc;
  const updatedBlock: StructuredBlock = { ...block, params: { ...block.params, milestones } };
  return regenerateBlockShapes(doc, updatedBlock, block.outline);
}

// Bar dependency links (doc/spec.md §6.2.6) - a flat barNodeId -> barNodeId
// map, same reasoning as milestones/month range for living in params instead
// of the outline (a dependency can point at a bar in any row, not just this
// bar's own parent/sibling).
export function updateScheduleConnections(doc: Document, blockId: string, connections: Record<string, string>): Document {
  const block = findBlock(doc, blockId);
  if (!block || block.pattern !== "schedule") return doc;
  const updatedBlock: StructuredBlock = { ...block, params: { ...block.params, connections } };
  return regenerateBlockShapes(doc, updatedBlock, block.outline);
}

// Matrix axis labels (params._axisShapeIds) sit outside the grid, deliberately
// at negative offsets from it (layoutMatrixAxisLabels), and are excluded here
// so they can never pull the computed origin - and so every later
// regeneration - further negative themselves (see updateMatrixAxisLabels's
// own clamp for how their absolute position is kept on-canvas).
function originOfBlock(doc: Document, block: StructuredBlock): { x: number; y: number } {
  const axisShapeIds = new Set((block.params._axisShapeIds as ShapeId[] | undefined) ?? []);
  const shapes = block.generatedShapeIds
    .filter((id) => !axisShapeIds.has(id))
    .map((id) => doc.shapes[id])
    .filter((s): s is Shape => Boolean(s));
  if (shapes.length === 0) return { x: 40, y: 40 };
  return { x: Math.min(...shapes.map((s) => s.x)), y: Math.min(...shapes.map((s) => s.y)) };
}

// Recomputes every generated shape's position from a fresh layout of
// `newOutline`, keeping each shape's own id (and any style customization) by
// matching on templateNodeIds. Used after restructuring (indent/outdent/move)
// where the tree shape changed but no nodes were added or removed - except
// pyramidChart, which relayoutOrRegenerate (below) routes to
// regenerateBlockShapes instead.
function relayoutBlock(doc: Document, block: StructuredBlock, newOutline: OutlineNode[]): Document {
  const origin = originOfBlock(doc, block);
  const layoutByNodeId = new Map<string, LayoutNode>();
  for (const layoutNode of layoutFor(block.pattern, newOutline, block.params)) {
    for (const nid of layoutNode.nodeIds) layoutByNodeId.set(nid, layoutNode);
  }

  const shapes = { ...doc.shapes };
  for (const shapeId of block.generatedShapeIds) {
    const shape = shapes[shapeId];
    if (!shape?.templateNodeIds?.length) continue;
    const layoutNode = shape.templateNodeIds.map((id) => layoutByNodeId.get(id)).find((l): l is LayoutNode => Boolean(l));
    if (!layoutNode) continue;
    shapes[shapeId] = { ...shape, x: origin.x + layoutNode.x, y: origin.y + layoutNode.y };
  }

  return withBlock({ ...doc, shapes }, block.id, (b) => ({ ...b, outline: newOutline }));
}

// pyramidChart's own band shapes (pyramidChart.ts's "polygon" kind) taper
// based on a level's INDEX among its siblings, not just its own content -
// unlike every other pattern's shapes, whose own width/height/points never
// depend on position. relayoutBlock (below) only ever copies a fresh
// layoutNode's x/y onto the existing shape, which is enough to reposition
// every other pattern correctly but would leave a reordered pyramidChart
// band's taper stale (still shaped for its OLD index). Routing it through a
// full regenerateBlockShapes instead sidesteps that - the same tradeoff
// (structural edits reset any manual per-shape style/id) every other
// isFullyRelayoutedPattern already accepts for add/delete.
//
// schedule needs the same full-regenerate treatment for a different reason:
// its month/row headers, grid lines, milestone markers, and dependency
// connectors (schedule.ts) are all untracked shapes (`templateNodeIds: []`),
// which relayoutBlock never touches (see below) - reordering a row without a
// full regenerate would leave the whole grid/header/connector layer stale
// against the rows' new positions.
//
// verticalFlow shares schedule's reason exactly: its badge-to-badge arrows
// (verticalFlow.ts) are untracked shapes too, so reordering steps without a
// full regenerate would leave them pointing at stale positions.
//
// horizontalFlow needs it for BOTH reasons at once: its circle-to-circle
// arrows are untracked shapes like verticalFlow's, AND each circle's own
// fill/dashed styling (horizontalFlow.ts's circleColorSlot, "first step is
// unfilled") depends on its INDEX among siblings like pyramidChart's band
// taper - relayoutBlock repositions a shape but never restyles it, so a
// reordered circle would keep its old color/fill.
//
// flowSchedule shares horizontalFlow's "both reasons" case: its row
// separators (and title-flanking rules) are untracked shapes like
// verticalFlow's badge arrows, AND each row heading's own "NN | " number
// (flowSchedule.ts's rowNumberPrefix, a bulletMarker) depends on its INDEX
// among siblings like pyramidChart's band taper - relayoutBlock repositions a
// shape but never touches its bulletMarker, so a reordered row would keep its
// old number.
//
// Either way, "pyramid"/"logicTree"'s connector lines (regenerateTreeConnectors)
// need a resync too: relayoutBlock repositions every ordinary node shape but,
// having no templateNodeIds, never touches connector shapes - which would
// otherwise keep pointing at their pre-restructure positions.
function relayoutOrRegenerate(doc: Document, block: StructuredBlock, newOutline: OutlineNode[]): Document {
  const next =
    block.pattern === "pyramidChart" ||
    block.pattern === "schedule" ||
    block.pattern === "verticalFlow" ||
    block.pattern === "horizontalFlow" ||
    block.pattern === "flowSchedule" ||
    block.pattern === "flowScheduleHorizontal" ||
    block.pattern === "timeline" ||
    block.pattern === "beforeAfter"
      ? // flowScheduleHorizontal shares flowSchedule's exact reasoning
        // (untracked title/connector shapes, plus an index-derived number
        // that relayoutBlock would never touch) - see flowSchedule's own
        // comment above.
        //
        // timeline needs it for a different reason than its siblings above:
        // relayoutBlock only ever repositions a shape it can still find by
        // nodeId in the FRESH layout - it never removes one whose nodeId no
        // longer appears there. Indenting a root event under another root
        // (Tab on a plain event, not its position-locked time child - see
        // StructuredTextPanel.tsx's isTimelineTimeLabel) moves it out of
        // layoutTimeline's top-level `outline` loop entirely, so it stops
        // appearing in that fresh layout - relayoutBlock would leave its old
        // dot/time/description shapes stranded on the canvas at their stale
        // position instead of removing them. Routing through
        // regenerateBlockShapes (which discards every old shape first)
        // avoids that; it also keeps the single shared track line's span
        // correct without needing its own reasoning, since regenerating from
        // scratch is already how add/delete keeps it correct.
        //
        // beforeAfter shares flowSchedule's/flowScheduleHorizontal's "both
        // reasons" case: its per-column down-arrow (beforeAfter.ts) is an
        // untracked shape whose X position depends on its column's INDEX,
        // which relayoutBlock (skipping every shape with no templateNodeIds)
        // would never update after a reorder - AND, like timeline, indenting
        // a root topic under another moves it out of layoutBeforeAfter's
        // top-level `outline` loop, which only a full regenerate cleans up
        // (see timeline's own comment above).
        regenerateBlockShapes(doc, block, newOutline)
      : relayoutBlock(doc, block, newOutline);
  return regenerateTreeConnectors(next, block.id);
}

export function indentOutlineNode(doc: Document, blockId: string, nodeId: string): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  const loc = getSiblingsAndIndex(block.outline, nodeId);
  if (!loc || loc.index === 0) return doc; // no preceding sibling to become the new parent

  const node = loc.siblings[loc.index];
  const newParentId = loc.siblings[loc.index - 1].id;

  let newOutline = updateChildren(block.outline, loc.parentId, (children) => children.filter((_, i) => i !== loc.index));
  newOutline = updateChildren(newOutline, newParentId, (children) => [...children, node]);

  return relayoutOrRegenerate(doc, block, newOutline);
}

export function outdentOutlineNode(doc: Document, blockId: string, nodeId: string): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  const loc = getSiblingsAndIndex(block.outline, nodeId);
  if (!loc || loc.parentId === null) return doc; // already at root level

  const node = loc.siblings[loc.index];
  const grandParentLoc = getSiblingsAndIndex(block.outline, loc.parentId);
  const grandParentId = grandParentLoc ? grandParentLoc.parentId : null;

  let newOutline = updateChildren(block.outline, loc.parentId, (children) => children.filter((_, i) => i !== loc.index));
  newOutline = updateChildren(newOutline, grandParentId, (children) => {
    const parentIndex = children.findIndex((n) => n.id === loc.parentId);
    return [...children.slice(0, parentIndex + 1), node, ...children.slice(parentIndex + 1)];
  });

  return relayoutOrRegenerate(doc, block, newOutline);
}

export function moveOutlineNode(doc: Document, blockId: string, nodeId: string, direction: "up" | "down"): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  const loc = getSiblingsAndIndex(block.outline, nodeId);
  if (!loc) return doc;
  const targetIndex = direction === "up" ? loc.index - 1 : loc.index + 1;
  if (targetIndex < 0 || targetIndex >= loc.siblings.length) return doc;

  const newOutline = updateChildren(block.outline, loc.parentId, (children) => {
    const copy = [...children];
    [copy[loc.index], copy[targetIndex]] = [copy[targetIndex], copy[loc.index]];
    return copy;
  });

  return relayoutOrRegenerate(doc, block, newOutline);
}

// Bulk replace (paste import, doc/spec.md §6.1): discards every shape this
// block previously generated and lays out fresh ones for the new outline.
export function replaceOutline(doc: Document, blockId: string, newOutline: OutlineNode[]): Document {
  const block = findBlock(doc, blockId);
  if (!block) return doc;
  const next = regenerateBlockShapes(doc, block, newOutline);
  return regenerateTreeConnectors(next, blockId);
}

// Discards every shape `block` previously generated (by nodeId) and lays out
// fresh ones for `newOutline`, using `block.params` for layout (so callers
// that also change params, e.g. updateVennSetCount, should pass a `block`
// with those params already merged in). Shared by replaceOutline (bulk
// import, any pattern) and every matrix/venn edit (doc/spec.md §6.2.1/§6.2.2 -
// their shape positions depend on the whole outline, not just the edited
// node, so incremental placement like pyramid/logicTree's doesn't apply).
function regenerateBlockShapes(doc: Document, block: StructuredBlock, newOutline: OutlineNode[]): Document {
  const origin = originOfBlock(doc, block);
  const shapes = { ...doc.shapes };
  for (const id of block.generatedShapeIds) delete shapes[id];

  const newShapeIds: ShapeId[] = [];
  let zIndex = Object.keys(shapes).length;
  for (const layoutNode of layoutFor(block.pattern, newOutline, block.params)) {
    const base = {
      id: uuidv4(),
      x: origin.x + layoutNode.x,
      y: origin.y + layoutNode.y,
      width: layoutNode.width,
      height: layoutNode.height,
      rotation: 0,
      zIndex: zIndex++,
      templateNodeIds: layoutNode.nodeIds,
    };
    const style = styleFor(doc.colorThemeId, layoutNode);
    const shape: Shape =
      layoutNode.kind === "ellipse"
        ? { ...base, type: "ellipse", style }
        : layoutNode.kind === "rect"
          ? { ...base, type: "rect", style, cornerRadius: layoutNode.cornerRadius }
          : layoutNode.kind === "line"
            ? layoutNode.arrowhead
              ? {
                  ...base,
                  type: "arrow",
                  style,
                  points: [
                    { x: base.x, y: base.y },
                    { x: base.x + base.width, y: base.y + base.height },
                  ],
                }
              : { ...base, type: "line", style }
            : layoutNode.kind === "polygon"
              ? { ...base, type: "polygon", style, points: layoutNode.points ?? [] }
              : {
                  ...base,
                  type: "text",
                  style,
                  content: layoutNode.text,
                  align: layoutNode.align ?? "center",
                  bulletMarker: layoutNode.bulletMarker,
                };
    shapes[shape.id] = shape;
    newShapeIds.push(shape.id);
  }

  const oldShapeIds = new Set(block.generatedShapeIds);
  const layers = doc.layers.map((layer) =>
    layer.id === DEFAULT_LAYER_ID
      ? { ...layer, shapeIds: [...layer.shapeIds.filter((id) => !oldShapeIds.has(id)), ...newShapeIds] }
      : layer,
  );

  return withBlock({ ...doc, shapes, layers }, block.id, (b) => ({
    ...b,
    params: block.params,
    outline: newOutline,
    generatedShapeIds: newShapeIds,
  }));
}
