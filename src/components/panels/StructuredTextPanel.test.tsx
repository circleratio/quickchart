import { act } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { StructuredBlock } from "../../core/model/document";
import { useDocumentStore } from "../../core/store/documentStore";
import { useStructuredEditorStore } from "../../core/store/structuredEditorStore";
import { StructuredTextPanel } from "./StructuredTextPanel";

// Adds a block of `pattern` with its first outline node(s) and opens it in
// the panel.
function openBlock(pattern: StructuredBlock["pattern"]): string {
  let blockId = "";
  act(() => {
    blockId = useDocumentStore.getState().addStructuredBlock(pattern);
    useDocumentStore.getState().addFirstOutlineNode(blockId);
    useStructuredEditorStore.getState().setActiveBlockId(blockId);
  });
  return blockId;
}

function blockOf(blockId: string): StructuredBlock {
  return useDocumentStore.getState().document.structuredBlocks.find((b) => b.id === blockId)!;
}

describe("StructuredTextPanel", () => {
  it("labels the header, shows the title editor and locks a timeline event's time label", () => {
    openBlock("timeline");
    render(<StructuredTextPanel />);

    expect(screen.getByText("階層テキスト(タイムライン)")).toBeInTheDocument();
    expect(screen.getByText("タイトル")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("時刻(例: 9:00)")).toBeInTheDocument();
    // Only the event itself can be deleted or get children - not its time label.
    expect(screen.getAllByTitle("削除")).toHaveLength(1);
    expect(screen.getAllByTitle("子を追加")).toHaveLength(1);
  });

  it("commits a title field through the block's params on blur", () => {
    const blockId = openBlock("flowSchedule");
    render(<StructuredTextPanel />);

    const input = screen.getByText("見出し").querySelector("input")!;
    fireEvent.change(input, { target: { value: "導入フロー" } });
    fireEvent.blur(input);
    expect(blockOf(blockId).params.title).toBe("導入フロー");
  });

  it("shows a bulletMatrix cell as a static label and resizes cells from the column list", () => {
    const blockId = openBlock("bulletMatrix");
    render(<StructuredTextPanel />);

    fireEvent.click(screen.getByText("+ 列を追加"));
    expect(blockOf(blockId).params.columnHeaders).toEqual([""]);
    expect(blockOf(blockId).outline[0].children).toHaveLength(1);
    expect(screen.getByText("セル(+子でタイトルを追加)")).toBeInTheDocument();
  });

  it("notes the matrix's 4-quadrant limit and places its axis labels below the outline", () => {
    openBlock("matrix");
    const { container } = render(<StructuredTextPanel />);

    expect(screen.getByText("マトリクスは4象限までです。")).toBeInTheDocument();
    const tree = container.querySelector(".outline-tree")!;
    const axisLabels = screen.getByText("タイトル・軸ラベル");
    expect(tree.compareDocumentPosition(axisLabels) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("locks gridMatrix's two axes without a limit note, and keeps their labels unnestable", () => {
    openBlock("gridMatrix");
    render(<StructuredTextPanel />);

    expect(screen.getByPlaceholderText("横軸の名前(例: 時間軸)")).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText("列の見出し(左から。例: 短期)")).toHaveLength(3);
    expect(screen.queryByText("設定した集合数までです。")).not.toBeInTheDocument();
    // Axes can take new labels; labels can't take children.
    expect(screen.getAllByTitle("子を追加")).toHaveLength(2);
  });

  it("switches venn's set count from the radio choice", () => {
    const blockId = openBlock("venn");
    render(<StructuredTextPanel />);

    fireEvent.click(screen.getByLabelText("2"));
    expect(blockOf(blockId).params.setCount).toBe(2);
  });
});
