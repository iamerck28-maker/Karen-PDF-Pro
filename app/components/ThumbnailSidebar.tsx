"use client";

import { useEffect, useRef, useState } from "react";

type PDFPageProxy = import("pdfjs-dist").PDFPageProxy;

interface ThumbnailSidebarProps {
  pages: PDFPageProxy[];
  pageNums: number[];
  currentPage: number;
  onPageClick: (pageNum: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

const THUMB_SCALE = 0.18;

export default function ThumbnailSidebar({
  pages,
  pageNums,
  currentPage,
  onPageClick,
  onReorder,
}: ThumbnailSidebarProps) {
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    pages.forEach(async (page, i) => {
      const pageNum = pageNums[i];
      const canvas = canvasRefs.current.get(pageNum);
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
  }, [pages, pageNums]);

  return (
    <div className="w-28 shrink-0 bg-gray-950 border-r border-gray-800 overflow-y-auto flex flex-col gap-2 py-3 px-2">
      {pages.map((_, i) => {
        const pageNum = pageNums[i];
        const isActive = pageNum === currentPage;
        const isDragTarget = dragOver === i && dragFrom !== i;

        return (
          <div
            key={pageNum}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null && dragFrom !== i) onReorder(dragFrom, i);
              setDragFrom(null);
              setDragOver(null);
            }}
            className={`flex flex-col items-center gap-1 rounded p-1 cursor-grab transition-all border-2 ${
              isActive ? "bg-blue-700 ring-2 ring-blue-400 border-transparent" :
              isDragTarget ? "border-yellow-400 bg-gray-700" :
              "border-transparent hover:bg-gray-800"
            } ${dragFrom === i ? "opacity-40" : ""}`}
            title={`Page ${pageNum} — drag to reorder`}
            onClick={() => onPageClick(pageNum)}
          >
            <canvas
              ref={(el) => { if (el) canvasRefs.current.set(pageNum, el); }}
              className="rounded shadow bg-white w-full pointer-events-none"
              style={{ display: "block" }}
            />
            <span className="text-xs text-gray-300">{pageNum}</span>
          </div>
        );
      })}
    </div>
  );
}
