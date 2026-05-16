"use client";

export type Tool =
  | "select"
  | "brush"
  | "text"
  | "image"
  | "rect"
  | "circle"
  | "line"
  | "eraser"
  | "highlight"
  | "pen";

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  brushColor: string;
  onBrushColorChange: (color: string) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  onImageUpload: (file: File) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  hasPdf: boolean;
  isExporting: boolean;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onSignatureClick: () => void;
  shapeFill: string;
  onShapeFillChange: (color: string) => void;
  textColor: string;
  onTextColorChange: (color: string) => void;
  fontFamily: string;
  onFontFamilyChange: (font: string) => void;
  bold: boolean;
  onBoldToggle: () => void;
  italic: boolean;
  onItalicToggle: () => void;
  underline: boolean;
  onUnderlineToggle: () => void;
}

export default function Toolbar({
  activeTool,
  onToolChange,
  brushColor,
  onBrushColorChange,
  brushSize,
  onBrushSizeChange,
  fontSize,
  onFontSizeChange,
  onImageUpload,
  onUndo,
  onRedo,
  onExport,
  hasPdf,
  isExporting,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  sidebarOpen,
  onToggleSidebar,
  onSignatureClick,
  shapeFill,
  onShapeFillChange,
  textColor,
  onTextColorChange,
  fontFamily,
  onFontFamilyChange,
  bold,
  onBoldToggle,
  italic,
  onItalicToggle,
  underline,
  onUnderlineToggle,
}: ToolbarProps) {
  const btnBase =
    "px-3 py-2 rounded text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const btnActive = "bg-blue-600 text-white";
  const btnInactive = "bg-gray-700 text-gray-200 hover:bg-gray-600";

  return (
    <div className="flex items-center gap-2 flex-wrap px-4 py-3 bg-gray-900 border-b border-gray-700 select-none">
      {/* Sidebar toggle */}
      <button
        className={`${btnBase} ${sidebarOpen ? btnActive : btnInactive}`}
        onClick={onToggleSidebar}
        title="Toggle Page Thumbnails"
      >
        ☰ Pages
      </button>

      <div className="w-px h-6 bg-gray-600" />
      {/* Tool buttons */}
      <div className="flex items-center gap-1 flex-wrap">
        <button
          className={`${btnBase} ${activeTool === "select" ? btnActive : btnInactive}`}
          onClick={() => onToolChange("select")}
          disabled={!hasPdf}
          title="Select / Pan"
        >
          ↖ Select
        </button>
        <button
          className={`${btnBase} ${activeTool === "brush" ? btnActive : btnInactive}`}
          onClick={() => onToolChange("brush")}
          disabled={!hasPdf}
          title="Free Draw"
        >
          ✏ Draw
        </button>
        <button
          className={`${btnBase} ${activeTool === "highlight" ? btnActive : btnInactive}`}
          onClick={() => onToolChange("highlight")}
          disabled={!hasPdf}
          title="Highlight"
        >
          ▌ Highlight
        </button>
        <button
          className={`${btnBase} ${activeTool === "eraser" ? btnActive : btnInactive}`}
          onClick={() => onToolChange("eraser")}
          disabled={!hasPdf}
          title="Eraser"
        >
          ◻ Eraser
        </button>
        <button
          className={`${btnBase} ${activeTool === "rect" ? btnActive : btnInactive}`}
          onClick={() => onToolChange("rect")}
          disabled={!hasPdf}
          title="Rectangle"
        >
          ▭ Rect
        </button>
        <button
          className={`${btnBase} ${activeTool === "circle" ? btnActive : btnInactive}`}
          onClick={() => onToolChange("circle")}
          disabled={!hasPdf}
          title="Ellipse"
        >
          ◯ Circle
        </button>
        <button
          className={`${btnBase} ${activeTool === "line" ? btnActive : btnInactive}`}
          onClick={() => onToolChange("line")}
          disabled={!hasPdf}
          title="Line"
        >
          ╱ Line
        </button>
        <button
          className={`${btnBase} ${activeTool === "pen" ? btnActive : btnInactive}`}
          onClick={() => onToolChange("pen")}
          disabled={!hasPdf}
          title="Pen Tool - click to add points, double-click to finish"
        >
          ✒ Pen
        </button>
        <button
          className={`${btnBase} ${activeTool === "text" ? btnActive : btnInactive}`}
          onClick={() => onToolChange("text")}
          disabled={!hasPdf}
          title="Add Text"
        >
          T Text
        </button>
        <label
          className={`${btnBase} ${activeTool === "image" ? btnActive : btnInactive} cursor-pointer`}
          title="Insert Image"
        >
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={!hasPdf}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onToolChange("image");
                onImageUpload(file);
                e.target.value = "";
              }
            }}
          />
          + Image
        </label>
        <button
          className={`${btnBase} ${btnInactive}`}
          onClick={onSignatureClick}
          disabled={!hasPdf}
          title="Add Signature"
        >
          ✍ Sign
        </button>
      </div>

      <div className="w-px h-6 bg-gray-600" />

      {/* Brush / shape stroke controls */}
      {["brush", "highlight", "eraser", "rect", "circle", "line", "arrow", "pen"].includes(activeTool) && (
        <div className="flex items-center gap-3 flex-wrap">
          {activeTool !== "eraser" && (
            <label className="flex items-center gap-2 text-sm text-gray-300">
              {["rect", "circle"].includes(activeTool) ? "Stroke" : "Color"}
              <input
                type="color"
                value={brushColor}
                onChange={(e) => onBrushColorChange(e.target.value)}
                className="w-8 h-8 cursor-pointer rounded border-0 bg-transparent"
              />
            </label>
          )}
          {["rect", "circle"].includes(activeTool) && (
            <label className="flex items-center gap-2 text-sm text-gray-300">
              Fill
              <input
                type="color"
                value={shapeFill === "transparent" ? "#ffffff" : shapeFill}
                onChange={(e) => onShapeFillChange(e.target.value)}
                className="w-8 h-8 cursor-pointer rounded border-0 bg-transparent"
              />
              <button
                onClick={() => onShapeFillChange("transparent")}
                className={`text-xs px-1.5 py-0.5 rounded ${shapeFill === "transparent" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}
                title="No fill"
              >∅</button>
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-300">
            Size {brushSize}px
            <input
              type="range"
              min={1}
              max={activeTool === "eraser" ? 80 : 50}
              value={brushSize}
              onChange={(e) => onBrushSizeChange(Number(e.target.value))}
              className="w-24 accent-blue-500"
            />
          </label>
        </div>
      )}

      {/* Text controls */}
      {activeTool === "text" && (
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={fontFamily}
            onChange={(e) => onFontFamilyChange(e.target.value)}
            className="bg-gray-700 text-gray-200 text-sm rounded px-2 py-1 border border-gray-600"
          >
            {["Arial", "Georgia", "Times New Roman", "Courier New", "Verdana", "Helvetica"].map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-sm text-gray-300">
            {fontSize}px
            <input
              type="range"
              min={8}
              max={96}
              value={fontSize}
              onChange={(e) => onFontSizeChange(Number(e.target.value))}
              className="w-20 accent-blue-500"
            />
          </label>
          <input
            type="color"
            value={textColor}
            onChange={(e) => onTextColorChange(e.target.value)}
            className="w-8 h-8 cursor-pointer rounded border-0 bg-transparent"
            title="Text color"
          />
          <button
            onClick={onBoldToggle}
            className={`${btnBase} ${bold ? btnActive : btnInactive} font-bold w-8`}
            title="Bold"
          >B</button>
          <button
            onClick={onItalicToggle}
            className={`${btnBase} ${italic ? btnActive : btnInactive} italic w-8`}
            title="Italic"
          >I</button>
          <button
            onClick={onUnderlineToggle}
            className={`${btnBase} ${underline ? btnActive : btnInactive} underline w-8`}
            title="Underline"
          >U</button>
        </div>
      )}

      <div className="flex-1" />

      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <button
          className={`${btnBase} ${btnInactive} w-8`}
          onClick={onZoomOut}
          disabled={!hasPdf}
          title="Zoom Out (Ctrl+-)"
        >
          −
        </button>
        <button
          className={`${btnBase} ${btnInactive} min-w-[52px] text-center`}
          onClick={onZoomReset}
          disabled={!hasPdf}
          title="Reset Zoom (Ctrl+0)"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          className={`${btnBase} ${btnInactive} w-8`}
          onClick={onZoomIn}
          disabled={!hasPdf}
          title="Zoom In (Ctrl+=)"
        >
          +
        </button>
      </div>

      <div className="w-px h-6 bg-gray-600" />

      {/* Undo/Redo */}
      <div className="flex items-center gap-1">
        <button
          className={`${btnBase} ${btnInactive}`}
          onClick={onUndo}
          disabled={!hasPdf}
          title="Undo (Ctrl+Z)"
        >
          ↩ Undo
        </button>
        <button
          className={`${btnBase} ${btnInactive}`}
          onClick={onRedo}
          disabled={!hasPdf}
          title="Redo (Ctrl+Shift+Z)"
        >
          ↪ Redo
        </button>
      </div>

      <div className="w-px h-6 bg-gray-600" />

      {/* Export */}
      <button
        className={`${btnBase} bg-green-700 text-white hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed`}
        onClick={onExport}
        disabled={!hasPdf || isExporting}
        title="Download edited PDF"
      >
        {isExporting ? "Exporting…" : "⬇ Download PDF"}
      </button>
    </div>
  );
}
