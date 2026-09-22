import { describe, expect, it } from "vitest";
import { contrastTextColor, getColorTheme } from "./style";

describe("contrastTextColor", () => {
  it("picks the theme's light text color against a dark background", () => {
    const theme = getColorTheme("neutral-blue");
    expect(contrastTextColor(theme, theme.primary[0])).toBe(theme.textLight); // darkest shade
  });

  it("picks the theme's dark text color against a light background", () => {
    const theme = getColorTheme("neutral-blue");
    expect(contrastTextColor(theme, theme.primary[4])).toBe(theme.textDark); // lightest shade
  });

  it("holds across every color theme preset, not just the default", () => {
    for (const id of ["neutral-blue", "warm-gray", "monochrome"]) {
      const theme = getColorTheme(id);
      expect(contrastTextColor(theme, theme.primary[0])).toBe(theme.textLight);
      expect(contrastTextColor(theme, theme.primary[4])).toBe(theme.textDark);
    }
  });
});
