export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function snapValue(value: number, gridSize: number): number {
  if (gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

export function snapPoint(point: Point, gridSize: number): Point {
  return { x: snapValue(point.x, gridSize), y: snapValue(point.y, gridSize) };
}

export function snapBox(box: Box, gridSize: number): Box {
  return {
    x: snapValue(box.x, gridSize),
    y: snapValue(box.y, gridSize),
    width: Math.max(gridSize, snapValue(box.width, gridSize)),
    height: Math.max(gridSize, snapValue(box.height, gridSize)),
  };
}
