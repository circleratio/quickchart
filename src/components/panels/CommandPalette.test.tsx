import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CommandPalette } from "./CommandPalette";

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<CommandPalette open={false} onSelectTool={() => {}} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists every ToolPanel tool and focuses the search input when opened", () => {
    render(<CommandPalette open onSelectTool={() => {}} onClose={() => {}} />);
    expect(screen.getByPlaceholderText("ツールを検索...")).toHaveFocus();
    for (const label of ["選択", "四角形", "楕円", "直線", "テキスト", "コネクタ", "矢印"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("filters the list by the search text", () => {
    render(<CommandPalette open onSelectTool={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("ツールを検索..."), { target: { value: "楕円" } });
    expect(screen.getByText("楕円")).toBeInTheDocument();
    expect(screen.queryByText("四角形")).not.toBeInTheDocument();
  });

  it("shows an empty-state message when nothing matches", () => {
    render(<CommandPalette open onSelectTool={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("ツールを検索..."), { target: { value: "存在しないツール" } });
    expect(screen.getByText("一致するツールがありません")).toBeInTheDocument();
  });

  it("Enter selects the focused (first, by default) tool and closes", () => {
    const onSelectTool = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette open onSelectTool={onSelectTool} onClose={onClose} />);

    fireEvent.keyDown(screen.getByPlaceholderText("ツールを検索..."), { key: "Enter" });

    expect(onSelectTool).toHaveBeenCalledWith("select");
    expect(onClose).toHaveBeenCalled();
  });

  it("ArrowDown moves focus to the next item before Enter commits it", () => {
    const onSelectTool = vi.fn();
    render(<CommandPalette open onSelectTool={onSelectTool} onClose={() => {}} />);
    const input = screen.getByPlaceholderText("ツールを検索...");

    fireEvent.keyDown(input, { key: "ArrowDown" }); // select -> rect
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelectTool).toHaveBeenCalledWith("rect");
  });

  it("Escape closes without selecting a tool", () => {
    const onSelectTool = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette open onSelectTool={onSelectTool} onClose={onClose} />);

    fireEvent.keyDown(screen.getByPlaceholderText("ツールを検索..."), { key: "Escape" });

    expect(onSelectTool).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking an item selects it directly", () => {
    const onSelectTool = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette open onSelectTool={onSelectTool} onClose={onClose} />);

    fireEvent.click(screen.getByText("矢印"));

    expect(onSelectTool).toHaveBeenCalledWith("arrow");
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the backdrop closes without selecting a tool", () => {
    const onSelectTool = vi.fn();
    const onClose = vi.fn();
    const { container } = render(<CommandPalette open onSelectTool={onSelectTool} onClose={onClose} />);

    fireEvent.click(container.querySelector(".command-palette-backdrop")!);

    expect(onSelectTool).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking inside the palette itself does not close it", () => {
    const onClose = vi.fn();
    const { container } = render(<CommandPalette open onSelectTool={() => {}} onClose={onClose} />);

    fireEvent.click(container.querySelector(".command-palette")!);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("resets the query when reopened", () => {
    const { rerender } = render(<CommandPalette open onSelectTool={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("ツールを検索..."), { target: { value: "楕円" } });
    expect(screen.queryByText("四角形")).not.toBeInTheDocument();

    rerender(<CommandPalette open={false} onSelectTool={() => {}} onClose={() => {}} />);
    rerender(<CommandPalette open onSelectTool={() => {}} onClose={() => {}} />);

    expect(screen.getByText("四角形")).toBeInTheDocument();
  });
});
