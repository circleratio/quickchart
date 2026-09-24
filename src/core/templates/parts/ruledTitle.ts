import { decoration, fixedText } from "../layoutNode";
import type { LayoutNode } from "../layoutNode";

export interface RuledTitleOptions {
  bandWidth: number;
  height: number;
  fontSize: number;
  // Horizontal breathing room between the title text band and the flanking
  // rules on either side of it.
  lineGap?: number;
}

const DEFAULT_LINE_GAP = 16;

// An optional block title (params.title) centered over `totalWidth` at y = 0,
// flanked by dashed rules filling the rest of the row on either side -
// flowSchedule (doc/spec.md §6.2.9) and its derivatives. Returns no nodes for
// a blank title, so callers can tell whether to push their content down.
export function ruledTitle(title: string, totalWidth: number, options: RuledTitleOptions): LayoutNode[] {
  const trimmed = title.trim();
  if (!trimmed) return [];
  const lineGap = options.lineGap ?? DEFAULT_LINE_GAP;
  // `totalWidth` is 0 for a block with no content yet; the band then keeps
  // its own width and the rules are skipped below.
  const bandWidth = Math.min(options.bandWidth, totalWidth || options.bandWidth);
  const bandX = (totalWidth - bandWidth) / 2;

  const result: LayoutNode[] = [
    fixedText(trimmed, {
      x: bandX,
      y: 0,
      width: bandWidth,
      height: options.height,
      kind: "label",
      align: "center",
      fontWeight: "bold",
      fontSize: options.fontSize,
      // No textColorSlot override: labelStyle's own default (theme.primary[0])
      // reads as the SAME blue as the content below it, matching the
      // reference images - not a contrasting "accent" callout color.
    }),
  ];

  // Only drawn if there's actually room for them (a very wide title band
  // could otherwise produce a negative-width line).
  const lineY = options.height / 2;
  const leftWidth = bandX - lineGap;
  if (leftWidth > 0) {
    const rightX = bandX + bandWidth + lineGap;
    result.push(decoration({ x: 0, y: lineY, width: leftWidth, height: 0, kind: "line" }));
    result.push(decoration({ x: rightX, y: lineY, width: totalWidth - rightX, height: 0, kind: "line" }));
  }
  return result;
}
