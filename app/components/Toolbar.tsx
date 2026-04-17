"use client";

export type Tool = "select" | "brush" | "image" | "text";

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
}: ToolbarProps) {
  const btnBase =
    "px-3 py-2 rounded text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const btnActive = "bg-blue-600 text-white";
  const btnInactive = "bg-gray-700 text-gray-200 hover:bg-gray-600";

  return (
    <div className="flex items-center gap-2 flex-wrap px-4 py-3 bg-gray-900 border-b border-gray-700 select-none">
      {/* Tool buttons */}
      <div className="flex items-center gap-1">
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
      </div>

      <div className="w-px h-6 bg-gray-600" />

      {/* Brush controls */}
      {activeTool === "brush" && (
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            Color
            <input
              type="color"
              value={brushColor}
              onChange={(e) => onBrushColorChange(e.target.value)}
              className="w-8 h-8 cursor-pointer rounded border-0 bg-transparent"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            Size {brushSize}px
            <input
              type="range"
              min={1}
              max={50}
              value={brushSize}
              onChange={(e) => onBrushSizeChange(Number(e.target.value))}
              className="w-24 accent-blue-500"
            />
          </label>
        </div>
      )}

      {/* Text controls */}
      {activeTool === "text" && (
        <label className="flex items-center gap-2 text-sm text-gray-300">
          Font size {fontSize}px
          <input
            type="range"
            min={8}
            max={96}
            value={fontSize}
            onChange={(e) => onFontSizeChange(Number(e.target.value))}
            className="w-24 accent-blue-500"
          />
        </label>
      )}

      <div className="flex-1" />

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
