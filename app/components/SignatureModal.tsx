"use client";

import { useEffect, useRef } from "react";

interface SignatureModalProps {
  onApply: (dataUrl: string) => void;
  onClose: () => void;
}

export default function SignatureModal({ onApply, onClose }: SignatureModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<import("fabric").Canvas | null>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    let fc: import("fabric").Canvas;
    (async () => {
      const { Canvas, PencilBrush } = await import("fabric");
      fc = new Canvas(el, {
        width: 480,
        height: 200,
        backgroundColor: "#fff",
        isDrawingMode: true,
      });
      const brush = new PencilBrush(fc);
      brush.color = "#111111";
      brush.width = 3;
      fc.freeDrawingBrush = brush;
      fabricRef.current = fc;
    })();

    return () => {
      fabricRef.current?.dispose();
      fabricRef.current = null;
    };
  }, []);

  const handleClear = () => {
    const fc = fabricRef.current;
    if (!fc) return;
    fc.clear();
    fc.backgroundColor = "#fff";
    fc.renderAll();
  };

  const handleApply = () => {
    const fc = fabricRef.current;
    if (!fc || fc.getObjects().length === 0) {
      onClose();
      return;
    }
    const dataUrl = fc.toDataURL({ format: "png", multiplier: 2 });
    onApply(dataUrl);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-gray-900 rounded-xl shadow-2xl p-6 flex flex-col gap-4 border border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Draw Signature</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="border-2 border-gray-600 rounded-lg overflow-hidden">
          <canvas ref={canvasRef} />
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={handleClear}
            className="px-4 py-2 rounded bg-gray-700 text-gray-200 hover:bg-gray-600 text-sm"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-gray-700 text-gray-200 hover:bg-gray-600 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 text-sm font-medium"
          >
            Apply to Page
          </button>
        </div>
      </div>
    </div>
  );
}
