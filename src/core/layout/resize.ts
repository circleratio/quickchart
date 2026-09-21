export interface ResizeBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees
}

export interface ResizeResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEG_TO_RAD = Math.PI / 180;

export function rotateVector(x: number, y: number, angleRad: number): [number, number] {
  return [x * Math.cos(angleRad) - y * Math.sin(angleRad), x * Math.sin(angleRad) + y * Math.cos(angleRad)];
}

// Given which handle is being dragged (dir: -1 start-side e.g. left/top, 1 end-side
// e.g. right/bottom, 0 not resized on this axis), returns the offset (from the
// box's own top-left, in the box's own width/height units) of the OPPOSITE
// corner/edge - the point that must stay visually fixed while dragging.
export function anchorOffset(dir: number, size: number): number {
  if (dir === 1) return 0;
  if (dir === -1) return size;
  return size / 2;
}

/**
 * Resizes `start` by a world-space (unrotated canvas coordinate) drag delta,
 * keeping the corner/edge opposite the dragged handle fixed on screen even when
 * the box is rotated. `direction` follows react-moveable's convention: each
 * component is -1, 0, or 1 for the handle being dragged along that axis.
 */
export function computeAnchoredResize(
  start: ResizeBox,
  direction: [number, number],
  worldDelta: { dx: number; dy: number },
  minSize = 1,
): ResizeResult {
  const [dirX, dirY] = direction;
  const rotRad = start.rotation * DEG_TO_RAD;
  const [localDx, localDy] = rotateVector(worldDelta.dx, worldDelta.dy, -rotRad);

  const newWidth = Math.max(minSize, start.width + dirX * localDx);
  const newHeight = Math.max(minSize, start.height + dirY * localDy);

  const startCenterX = start.x + start.width / 2;
  const startCenterY = start.y + start.height / 2;
  const [anchorFromCenterX, anchorFromCenterY] = rotateVector(
    anchorOffset(dirX, start.width) - start.width / 2,
    anchorOffset(dirY, start.height) - start.height / 2,
    rotRad,
  );
  const anchorWorldX = startCenterX + anchorFromCenterX;
  const anchorWorldY = startCenterY + anchorFromCenterY;

  const [newAnchorFromCenterX, newAnchorFromCenterY] = rotateVector(
    anchorOffset(dirX, newWidth) - newWidth / 2,
    anchorOffset(dirY, newHeight) - newHeight / 2,
    rotRad,
  );
  const newCenterX = anchorWorldX - newAnchorFromCenterX;
  const newCenterY = anchorWorldY - newAnchorFromCenterY;

  return {
    x: newCenterX - newWidth / 2,
    y: newCenterY - newHeight / 2,
    width: newWidth,
    height: newHeight,
  };
}
