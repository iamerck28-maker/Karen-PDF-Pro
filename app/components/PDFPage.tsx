"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Tool } from "./Toolbar";

type FabricCanvas = import("fabric").Canvas;
type PDFPageProxy = import("pdfjs-dist").PDFPageProxy;

interface PDFPageProps {
  pageNum: number;
  pdfPage: PDFPageProxy;
  scale: number;
  activeTool: Tool;
  brushColor: string;
  brushSize: number;
  fontSize: number;
  pendingImage: string | null;
  onCanvasReady: (pageNum: number, fc: FabricCanvas) => void;
  onFocus: (pageNum: number) => void;
  onPendingImageConsumed: () => void;
}

export default function PDFPage({
  pageNum,
  pdfPage,
  scale,
  activeTool,
  brushColor,
  brushSize,
  fontSize,
  pendingImage,
  onCanvasReady,
  onFocus,
  onPendingImageConsumed,
}: PDFPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricMountRef = useRef<HTMLDivElement>(null); // stable mount point for Fabric
  const fabricCanvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [rendered, setRendered] = useState(false);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  // Render PDF page onto the base canvas
  const renderPdfPage = useCallback(async () => {
    const canvas = pdfCanvasRef.current;
    if (!canvas) return;
    const viewport = pdfPage.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }
    const task = pdfPage.render({ canvas, viewport });
    renderTaskRef.current = task;
    try {
      await task.promise;
      setRendered(true);
    } catch {
      // Render was cancelled — expected when re-renders happen
    }
  }, [pdfPage, scale]);

  // Initialize Fabric.js overlay canvas
  const initFabric = useCallback(async () => {
    const el = fabricCanvasElRef.current;
    if (!el || fabricRef.current) return;

    const viewport = pdfPage.getViewport({ scale });
    const { Canvas, PencilBrush } = await import("fabric");

    const fc = new Canvas(el, {
      width: viewport.width,
      height: viewport.height,
      selection: true,
      isDrawingMode: false,
      renderOnAddRemove: true,
    });

    // The tool-sync effect below will set the correct brush/mode immediately
    fc.freeDrawingBrush = new PencilBrush(fc);

    fabricRef.current = fc;
    onCanvasReady(pageNum, fc);

    fc.on("mouse:down", () => onFocus(pageNum));
  }, [pdfPage, scale, pageNum, onCanvasReady, onFocus]);

  // Virtual rendering: trigger on intersection
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          renderPdfPage();
          initFabric();
        }
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [renderPdfPage, initFabric]);

  // Dispose Fabric canvas and cancel any in-flight render on unmount
  useEffect(() => {
    return () => {
      renderTaskRef.current?.cancel();
      fabricRef.current?.dispose();
      fabricRef.current = null;
    };
  }, []);

  // Compute page dimensions for placeholder sizing
  useEffect(() => {
    const viewport = pdfPage.getViewport({ scale });
    setPageSize({ width: viewport.width, height: viewport.height });
  }, [pdfPage, scale]);

  // Sync active tool + brush settings to all fabric canvases
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc) return;
    const update = async () => {
      const { PencilBrush } = await import("fabric");
      fc.isDrawingMode = activeTool === "brush";
      fc.selection = activeTool === "select";
      if (activeTool === "brush") {
        if (!fc.freeDrawingBrush) {
          fc.freeDrawingBrush = new PencilBrush(fc);
        }
        fc.freeDrawingBrush.color = brushColor;
        fc.freeDrawingBrush.width = brushSize;
      }
      if (activeTool !== "select") {
        fc.discardActiveObject();
        fc.renderAll();
      }
    };
    update();
  }, [activeTool, brushColor, brushSize]);

  // Fallback: insert pending image if this is page 1 and the canvas
  // wasn't ready when the upload happened (edge case on cold load)
  useEffect(() => {
    if (!pendingImage || !fabricRef.current || pageNum !== 1) return;
    const fc = fabricRef.current;
    const insertImage = async () => {
      try {
        const { FabricImage } = await import("fabric");
        const img = await FabricImage.fromURL(pendingImage);
        const maxW = (pageSize.width || 400) * 0.5;
        const scaleFactor = Math.min(1, maxW / (img.width || 1));
        img.scale(scaleFactor);
        img.set({ left: 50, top: 50, globalCompositeOperation: "multiply" });
        fc.add(img);
        fc.setActiveObject(img);
        fc.renderAll();
      } finally {
        onPendingImageConsumed();
      }
    };
    insertImage();
  }, [pendingImage, pageSize, pageNum, onPendingImageConsumed]);

  // Text placement: click to add IText in text mode
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc || activeTool !== "text") return;

    const handler = (opt: { scenePoint?: { x: number; y: number } }) => {
      const x = opt.scenePoint?.x ?? 100;
      const y = opt.scenePoint?.y ?? 100;
      const place = async () => {
        try {
          const { IText } = await import("fabric");
          const text = new IText("Edit me", {
            left: x,
            top: y,
            fontSize,
            fill: "#111111",
            fontFamily: "Arial",
          });
          fc.add(text);
          fc.setActiveObject(text);
          text.enterEditing();
          fc.renderAll();
        } catch {
          // import or placement failed — do nothing
        }
      };
      place();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fc.on("mouse:down", handler as any);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fc.off("mouse:down", handler as any);
    };
  }, [activeTool, fontSize]);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto shadow-2xl mb-6"
      style={{
        width: pageSize.width || 820,
        height: pageSize.height || 1060,
        background: "#fff",
      }}
      data-page={pageNum}
    >
      {/* Layer 1: PDF.js base render */}
      <canvas
        ref={pdfCanvasRef}
        style={{ position: "absolute", top: 0, left: 0 }}
      />

      {/* Layer 2: Fabric.js overlay — mounted inside a stable positioned div */}
      <div
        ref={fabricMountRef}
        style={{ position: "absolute", top: 0, left: 0, zIndex: 2 }}
      >
        <canvas ref={fabricCanvasElRef} />
      </div>

      {/* Loading overlay */}
      {!rendered && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 text-gray-500 text-sm z-10 pointer-events-none">
          Loading page {pageNum}…
        </div>
      )}

      {/* Page number label */}
      <div className="absolute bottom-2 right-2 bg-black bg-opacity-40 text-white text-xs px-2 py-0.5 rounded z-20 pointer-events-none">
        {pageNum}
      </div>
    </div>
  );
}
