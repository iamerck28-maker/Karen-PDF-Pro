"use client";

import { useEffect, useRef } from "react";

type PDFPageProxy = import("pdfjs-dist").PDFPageProxy;

interface ThumbnailSidebarProps {
  pages: PDFPageProxy[];
  currentPage: number;
  onPageClick: (pageNum: number) => void;
}

const THUMB_SCALE = 0.18;

export default function ThumbnailSidebar({
  pages,
  currentPage,
  onPageClick,
}: ThumbnailSidebarProps) {
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  useEffect(() => {
    pages.forEach(async (page, i) => {
      const canvas = canvasRefs.current.get(i + 1);
      if (!canvas) return;
      const viewport = page.getViewport({ scale: THUMB_SCALE });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      try {
        await page.render({ canvas, viewport }).promise;
      } catch {
        // ignore cancelled renders
      }
    });
  }, [pages]);

  return (
    <div className="w-28 shrink-0 bg-gray-950 border-r border-gray-800 overflow-y-auto flex flex-col gap-2 py-3 px-2">
      {pages.map((_, i) => {
        const pageNum = i + 1;
        const isActive = pageNum === currentPage;
        return (
          <button
            key={pageNum}
            onClick={() => onPageClick(pageNum)}
            className={`flex flex-col items-center gap-1 rounded p-1 transition-colors ${
              isActive
                ? "bg-blue-700 ring-2 ring-blue-400"
                : "hover:bg-gray-800"
            }`}
            title={`Page ${pageNum}`}
          >
            <canvas
              ref={(el) => {
                if (el) canvasRefs.current.set(pageNum, el);
              }}
              className="rounded shadow bg-white w-full"
              style={{ display: "block" }}
            />
            <span className="text-xs text-gray-300">{pageNum}</span>
          </button>
        );
      })}
    </div>
  );
}
