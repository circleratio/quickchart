export interface AlignBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PositionPatch = Record<string, { x?: number; y?: number }>;

function right(b: AlignBox) {
  return b.x + b.width;
}
function bottom(b: AlignBox) {
  return b.y + b.height;
}
function centerX(b: AlignBox) {
  return b.x + b.width / 2;
}
function centerY(b: AlignBox) {
  return b.y + b.height / 2;
}

export function alignLeft(boxes: AlignBox[]): PositionPatch {
  if (boxes.length < 2) return {};
  const minX = Math.min(...boxes.map((b) => b.x));
  return Object.fromEntries(boxes.map((b) => [b.id, { x: minX }]));
}

export function alignRight(boxes: AlignBox[]): PositionPatch {
  if (boxes.length < 2) return {};
  const maxRight = Math.max(...boxes.map(right));
  return Object.fromEntries(boxes.map((b) => [b.id, { x: maxRight - b.width }]));
}

export function alignTop(boxes: AlignBox[]): PositionPatch {
  if (boxes.length < 2) return {};
  const minY = Math.min(...boxes.map((b) => b.y));
  return Object.fromEntries(boxes.map((b) => [b.id, { y: minY }]));
}

export function alignBottom(boxes: AlignBox[]): PositionPatch {
  if (boxes.length < 2) return {};
  const maxBottom = Math.max(...boxes.map(bottom));
  return Object.fromEntries(boxes.map((b) => [b.id, { y: maxBottom - b.height }]));
}

export function alignCenterHorizontal(boxes: AlignBox[]): PositionPatch {
  if (boxes.length < 2) return {};
  const avgCenterX = boxes.reduce((sum, b) => sum + centerX(b), 0) / boxes.length;
  return Object.fromEntries(boxes.map((b) => [b.id, { x: avgCenterX - b.width / 2 }]));
}

export function alignCenterVertical(boxes: AlignBox[]): PositionPatch {
  if (boxes.length < 2) return {};
  const avgCenterY = boxes.reduce((sum, b) => sum + centerY(b), 0) / boxes.length;
  return Object.fromEntries(boxes.map((b) => [b.id, { y: avgCenterY - b.height / 2 }]));
}

export function distributeHorizontally(boxes: AlignBox[]): PositionPatch {
  if (boxes.length < 3) return {};
  const sorted = [...boxes].sort((a, b) => a.x - b.x);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalWidth = sorted.reduce((sum, b) => sum + b.width, 0);
  const gap = (right(last) - first.x - totalWidth) / (sorted.length - 1);

  const patch: PositionPatch = {};
  let cursor = first.x;
  for (const b of sorted) {
    patch[b.id] = { x: cursor };
    cursor += b.width + gap;
  }
  return patch;
}

export function distributeVertically(boxes: AlignBox[]): PositionPatch {
  if (boxes.length < 3) return {};
  const sorted = [...boxes].sort((a, b) => a.y - b.y);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalHeight = sorted.reduce((sum, b) => sum + b.height, 0);
  const gap = (bottom(last) - first.y - totalHeight) / (sorted.length - 1);

  const patch: PositionPatch = {};
  let cursor = first.y;
  for (const b of sorted) {
    patch[b.id] = { y: cursor };
    cursor += b.height + gap;
  }
  return patch;
}
