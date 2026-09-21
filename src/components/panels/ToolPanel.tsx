import type { Tool } from "../../core/model/shape";

interface ToolPanelProps {
  activeTool: Tool;
  onSelectTool: (tool: Tool) => void;
}

const TOOLS: { id: Tool; label: string }[] = [
  { id: "select", label: "選択" },
  { id: "rect", label: "四角形" },
  { id: "ellipse", label: "楕円" },
  { id: "line", label: "直線" },
  { id: "text", label: "テキスト" },
  { id: "connector", label: "コネクタ" },
  { id: "arrow", label: "矢印" },
];

export function ToolPanel({ activeTool, onSelectTool }: ToolPanelProps) {
  return (
    <div className="tool-panel">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={tool.id === activeTool ? "tool-button tool-button-active" : "tool-button"}
          onClick={() => onSelectTool(tool.id)}
        >
          {tool.label}
        </button>
      ))}
    </div>
  );
}
