import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ToolPanel } from "./ToolPanel";

describe("ToolPanel", () => {
  it("renders an icon-only button per tool, each labeled via title rather than visible text", () => {
    render(<ToolPanel activeTool="select" onSelectTool={() => {}} onOpenPalette={() => {}} />);
    for (const label of ["選択", "四角形", "楕円", "直線", "テキスト", "コネクタ", "矢印"]) {
      expect(screen.getByTitle(label)).toBeInTheDocument();
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("highlights only the active tool's button", () => {
    render(<ToolPanel activeTool="ellipse" onSelectTool={() => {}} onOpenPalette={() => {}} />);
    expect(screen.getByTitle("楕円")).toHaveClass("tool-icon-button-active");
    expect(screen.getByTitle("四角形")).not.toHaveClass("tool-icon-button-active");
  });

  it("clicking a tool button calls onSelectTool with that tool's id", () => {
    const onSelectTool = vi.fn();
    render(<ToolPanel activeTool="select" onSelectTool={onSelectTool} onOpenPalette={() => {}} />);
    fireEvent.click(screen.getByTitle("矢印"));
    expect(onSelectTool).toHaveBeenCalledWith("arrow");
  });

  it("clicking the palette trigger calls onOpenPalette", () => {
    const onOpenPalette = vi.fn();
    render(<ToolPanel activeTool="select" onSelectTool={() => {}} onOpenPalette={onOpenPalette} />);
    fireEvent.click(screen.getByTitle("コマンドパレット (Ctrl+K)"));
    expect(onOpenPalette).toHaveBeenCalled();
  });
});
