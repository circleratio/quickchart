import type { SVGProps } from "react";
import type { Tool } from "../../core/model/shape";

interface ToolPanelProps {
  activeTool: Tool;
  onSelectTool: (tool: Tool) => void;
  onOpenPalette: () => void;
}

// Minimal line-style icons matching ShapeRenderer.tsx's own stroke-only look
// (doc/spec.md §5.1) - hand-drawn rather than pulling in an icon library,
// since 7 icons is cheaper to maintain inline than to add a dependency for.
function IconSvg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
}

function SelectIcon() {
  return (
    <IconSvg>
      <path d="M4 3 L4 17 L8 13 L10.5 18.5 L12.5 17.5 L10 12.5 L16 12 Z" strokeLinejoin="round" fill="currentColor" stroke="none" />
    </IconSvg>
  );
}

function RectIcon() {
  return (
    <IconSvg>
      <rect x="3" y="5" width="14" height="10" rx="1" />
    </IconSvg>
  );
}

function EllipseIcon() {
  return (
    <IconSvg>
      <ellipse cx="10" cy="10" rx="7" ry="5" />
    </IconSvg>
  );
}

function LineIcon() {
  return (
    <IconSvg>
      <line x1="4" y1="16" x2="16" y2="4" />
    </IconSvg>
  );
}

function TextIcon() {
  return (
    <IconSvg>
      <text x="10" y="15" textAnchor="middle" fontSize="13" fontWeight="bold" stroke="none" fill="currentColor">
        A
      </text>
    </IconSvg>
  );
}

function ConnectorIcon() {
  return (
    <IconSvg>
      <circle cx="4" cy="16" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="16" cy="4" r="1.6" fill="currentColor" stroke="none" />
      <line x1="5.2" y1="14.8" x2="14.8" y2="5.2" />
    </IconSvg>
  );
}

function ArrowIcon() {
  return (
    <IconSvg>
      <line x1="4" y1="16" x2="15" y2="5" />
      <polyline points="8,5 15,5 15,12" />
    </IconSvg>
  );
}

export function SearchIcon() {
  return (
    <IconSvg>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <line x1="12.7" y1="12.7" x2="17" y2="17" />
    </IconSvg>
  );
}

// Shared with CommandPalette.tsx (doc/spec.md §5.1) - a single list so the
// palette's searchable items never drift out of sync with the icon panel's
// own buttons.
export const TOOLS: { id: Tool; label: string; Icon: () => React.JSX.Element }[] = [
  { id: "select", label: "選択", Icon: SelectIcon },
  { id: "rect", label: "四角形", Icon: RectIcon },
  { id: "ellipse", label: "楕円", Icon: EllipseIcon },
  { id: "line", label: "直線", Icon: LineIcon },
  { id: "text", label: "テキスト", Icon: TextIcon },
  { id: "connector", label: "コネクタ", Icon: ConnectorIcon },
  { id: "arrow", label: "矢印", Icon: ArrowIcon },
];

export function ToolPanel({ activeTool, onSelectTool, onOpenPalette }: ToolPanelProps) {
  return (
    <div className="tool-panel">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          title={tool.label}
          className={tool.id === activeTool ? "tool-icon-button tool-icon-button-active" : "tool-icon-button"}
          onClick={() => onSelectTool(tool.id)}
        >
          <tool.Icon />
        </button>
      ))}
      <button type="button" title="コマンドパレット (Ctrl+K)" className="tool-icon-button tool-palette-trigger" onClick={onOpenPalette}>
        <SearchIcon />
      </button>
    </div>
  );
}
