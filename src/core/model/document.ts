import type { Shape, ShapeId } from "./shape";
import { DEFAULT_COLOR_THEME_ID } from "./style";

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  shapeIds: ShapeId[];
}

// Used by structured templates (Phase 7+); present on Document now so its shape
// doesn't need to change later, but unused until then.
export interface OutlineNode {
  id: string;
  text: string;
  children: OutlineNode[];
}

export interface StructuredBlock {
  id: string;
  pattern:
    | "pyramid"
    | "logicTree"
    | "matrix"
    | "venn"
    | "headingBullets"
    | "bulletMatrix"
    | "pyramidChart"
    | "schedule";
  outline: OutlineNode[];
  params: Record<string, unknown>;
  generatedShapeIds: ShapeId[];
}

export interface Document {
  formatVersion: number;
  shapes: Record<ShapeId, Shape>;
  layers: Layer[];
  structuredBlocks: StructuredBlock[];
  colorThemeId: string;
}

export const DEFAULT_LAYER_ID = "default";

export function createEmptyDocument(): Document {
  return {
    formatVersion: 1,
    shapes: {},
    layers: [
      {
        id: DEFAULT_LAYER_ID,
        name: "Layer 1",
        visible: true,
        locked: false,
        shapeIds: [],
      },
    ],
    structuredBlocks: [],
    colorThemeId: DEFAULT_COLOR_THEME_ID,
  };
}
