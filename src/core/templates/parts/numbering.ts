// Position-derived step number, zero-padded to 2 digits ("01", "02", ...) -
// always regenerated from the step's index rather than stored in the outline.
export function stepNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}
