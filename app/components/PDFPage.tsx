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
  rotation?: number;
  shapeFill?: string;
  textColor?: string;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
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
  rotation = 0,
  shapeFill = "transparent",
  textColor = "#111111",
  fontFamily = "Arial",
  bold = false,
  italic = false,
  underline = false,
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
  const prevScaleRef = useRef(scale);

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

    // Initial tool/brush values are set here; the sync effect below keeps
    // them up-to-date on every change, so they don't belong in these deps.
    const fc = new Canvas(el, {
      width: viewport.width,
      height: viewport.height,
      selection: false,
      isDrawingMode: false,
      renderOnAddRemove: true,
    });

    const brush = new PencilBrush(fc);
    fc.freeDrawingBrush = brush;

    fabricRef.current = fc;
    onCanvasReady(pageNum, fc);

    fc.on("mouse:down", () => onFocus(pageNum));
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      fc.isDrawingMode = activeTool === "brush" || activeTool === "highlight";
      fc.selection = activeTool === "select";
      if (activeTool === "brush") {
        if (!fc.freeDrawingBrush) fc.freeDrawingBrush = new PencilBrush(fc);
        fc.freeDrawingBrush.color = brushColor;
        fc.freeDrawingBrush.width = brushSize;
      }
      if (activeTool === "highlight") {
        if (!fc.freeDrawingBrush) fc.freeDrawingBrush = new PencilBrush(fc);
        fc.freeDrawingBrush.color = brushColor + "66"; // ~40% opacity, user controls color
        fc.freeDrawingBrush.width = Math.max(brushSize, 12);
      }
      if (!["select", "brush", "highlight"].includes(activeTool)) {
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
      const { FabricImage } = await import("fabric");
      const img = await FabricImage.fromURL(pendingImage);
      const maxW = (pageSize.width || 400) * 0.5;
      const scaleFactor = Math.min(1, maxW / (img.width || 1));
      img.scale(scaleFactor);
      img.set({ left: 50, top: 50, globalCompositeOperation: "multiply" });
      fc.add(img);
      fc.setActiveObject(img);
      fc.renderAll();
      onPendingImageConsumed();
    };
    insertImage();
  }, [pendingImage, pageSize, pageNum, onPendingImageConsumed]);

  // Resize fabric canvas and scale objects when zoom/scale changes
  useEffect(() => {
    const prevScale = prevScaleRef.current;
    prevScaleRef.current = scale;
    const fc = fabricRef.current;
    if (!fc || prevScale === scale) return;
    const ratio = scale / prevScale;
    const viewport = pdfPage.getViewport({ scale });
    fc.setDimensions({ width: viewport.width, height: viewport.height });
    fc.getObjects().forEach((obj) => {
      obj.set({
        left: (obj.left ?? 0) * ratio,
        top: (obj.top ?? 0) * ratio,
        scaleX: (obj.scaleX ?? 1) * ratio,
        scaleY: (obj.scaleY ?? 1) * ratio,
      });
      obj.setCoords();
    });
    fc.renderAll();
  }, [scale, pdfPage]);

  // Shape drawing: rect, circle, line, arrow
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc || !["rect", "circle", "line", "arrow"].includes(activeTool)) return;

    let isDown = false;
    let startX = 0;
    let startY = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let activeShape: any = null;

    const onDown = async (opt: { scenePoint?: { x: number; y: number } }) => {
      isDown = true;
      startX = opt.scenePoint?.x ?? 0;
      startY = opt.scenePoint?.y ?? 0;

      const { Rect, Ellipse, Line } = await import("fabric");
      if (activeTool === "rect") {
        activeShape = new Rect({
          left: startX, top: startY, width: 0, height: 0,
          fill: shapeFill, stroke: brushColor, strokeWidth: brushSize,
          selectable: false, evented: false,
        });
      } else if (activeTool === "circle") {
        activeShape = new Ellipse({
          left: startX, top: startY, rx: 0, ry: 0,
          fill: shapeFill, stroke: brushColor, strokeWidth: brushSize,
          selectable: false, evented: false,
        });
      } else {
        // line and arrow both start as a Line preview
        activeShape = new Line([startX, startY, startX, startY], {
          stroke: brushColor, strokeWidth: brushSize,
          selectable: false, evented: false,
        });
      }
      fc.add(activeShape);
      fc.renderAll();
    };

    const onMove = (opt: { scenePoint?: { x: number; y: number } }) => {
      if (!isDown || !activeShape) return;
      const x = opt.scenePoint?.x ?? 0;
      const y = opt.scenePoint?.y ?? 0;
      const dx = x - startX;
      const dy = y - startY;

      if (activeTool === "rect") {
        activeShape.set({
          left: dx < 0 ? x : startX,
          top: dy < 0 ? y : startY,
          width: Math.abs(dx),
          height: Math.abs(dy),
        });
      } else if (activeTool === "circle") {
        activeShape.set({
          left: dx < 0 ? x : startX,
          top: dy < 0 ? y : startY,
          rx: Math.abs(dx) / 2,
          ry: Math.abs(dy) / 2,
        });
      } else {
        activeShape.set({ x2: x, y2: y });
      }
      fc.renderAll();
    };

    const onUp = async () => {
      isDown = false;
      if (!activeShape) return;

      if (activeTool === "arrow") {
        const x1 = startX;
        const y1 = startY;
        const x2 = activeShape.get("x2") ?? x1;
        const y2 = activeShape.get("y2") ?? y1;
        fc.remove(activeShape);
        activeShape = null;

        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = Math.max(16, brushSize * 4);
        const headAngle = Math.PI / 6;
        const h1x = x2 - headLen * Math.cos(angle - headAngle);
        const h1y = y2 - headLen * Math.sin(angle - headAngle);
        const h2x = x2 - headLen * Math.cos(angle + headAngle);
        const h2y = y2 - headLen * Math.sin(angle + headAngle);

        const { Path } = await import("fabric");
        const arrow = new Path(
          `M ${x1} ${y1} L ${x2} ${y2} L ${h1x} ${h1y} M ${x2} ${y2} L ${h2x} ${h2y}`,
          { stroke: brushColor, strokeWidth: brushSize, fill: "transparent", selectable: true }
        );
        fc.add(arrow);
        fc.setActiveObject(arrow);
      } else {
        activeShape.set({ selectable: true, evented: true });
        fc.setActiveObject(activeShape);
        activeShape = null;
      }
      fc.renderAll();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fc.on("mouse:down", onDown as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fc.on("mouse:move", onMove as any);
    fc.on("mouse:up", onUp);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fc.off("mouse:down", onDown as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fc.off("mouse:move", onMove as any);
      fc.off("mouse:up", onUp);
    };
  }, [activeTool, brushColor, brushSize, shapeFill]);

  // Eraser: click on objects to remove them
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc || activeTool !== "eraser") return;

    const erase = (opt: { scenePoint?: { x: number; y: number } }) => {
      if (!opt.scenePoint) return;
      const pt = opt.scenePoint;
      const objects = fc.getObjects();
      for (let i = objects.length - 1; i >= 0; i--) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (objects[i].containsPoint(pt as any)) {
          fc.remove(objects[i]);
          fc.renderAll();
          break;
        }
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fc.on("mouse:down", erase as any);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fc.off("mouse:down", erase as any);
    };
  }, [activeTool]);

  // Pen tool: click to add anchor points, double-click to finish path
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc || activeTool !== "pen") return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let points: Array<{ x: number; y: number }> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let previewLine: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let anchors: any[] = [];

    const addAnchor = async (x: number, y: number) => {
      const { Circle } = await import("fabric");
      const dot = new Circle({
        left: x - 4,
        top: y - 4,
        radius: 4,
        fill: brushColor,
        stroke: "#fff",
        strokeWidth: 1,
        selectable: false,
        evented: false,
        data: { isPenAnchor: true },
      });
      fc.add(dot);
      anchors.push(dot);
      fc.renderAll();
    };

    const updatePreview = async (toX: number, toY: number) => {
      const { Line } = await import("fabric");
      if (previewLine) fc.remove(previewLine);
      if (points.length === 0) return;
      const last = points[points.length - 1];
      previewLine = new Line([last.x, last.y, toX, toY], {
        stroke: brushColor,
        strokeWidth: brushSize,
        strokeDashArray: [4, 4],
        selectable: false,
        evented: false,
        data: { isPenPreview: true },
      });
      fc.add(previewLine);
      fc.renderAll();
    };

    const finishPath = async () => {
      if (previewLine) { fc.remove(previewLine); previewLine = null; }
      anchors.forEach(a => fc.remove(a));
      anchors = [];
      if (points.length < 2) { points = []; fc.renderAll(); return; }

      const { Path } = await import("fabric");
      let d = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        d += ` L ${points[i].x} ${points[i].y}`;
      }
      const path = new Path(d, {
        fill: "transparent",
        stroke: brushColor,
        strokeWidth: brushSize,
        selectable: true,
      });
      fc.add(path);
      fc.setActiveObject(path);
      fc.renderAll();
      points = [];
    };

    const onClick = (opt: { scenePoint?: { x: number; y: number }; e?: MouseEvent }) => {
      const x = opt.scenePoint?.x ?? 0;
      const y = opt.scenePoint?.y ?? 0;
      if ((opt.e as MouseEvent)?.detail === 2) return; // double-click handled separately
      points.push({ x, y });
      addAnchor(x, y);
    };

    const onDblClick = () => { finishPath(); };

    const onMove = (opt: { scenePoint?: { x: number; y: number } }) => {
      if (points.length === 0) return;
      updatePreview(opt.scenePoint?.x ?? 0, opt.scenePoint?.y ?? 0);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fc.on("mouse:down", onClick as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fc.on("mouse:dblclick", onDblClick as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fc.on("mouse:move", onMove as any);

    return () => {
      // Clean up in-progress pen state
      if (previewLine) fc.remove(previewLine);
      anchors.forEach(a => fc.remove(a));
      fc.renderAll();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fc.off("mouse:down", onClick as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fc.off("mouse:dblclick", onDblClick as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fc.off("mouse:move", onMove as any);
    };
  }, [activeTool, brushColor, brushSize]);

  // Text placement: click to add IText in text mode
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc || activeTool !== "text") return;

    const handler = (opt: { scenePoint?: { x: number; y: number } }) => {
      const x = opt.scenePoint?.x ?? 100;
      const y = opt.scenePoint?.y ?? 100;
      const place = async () => {
        const { IText } = await import("fabric");
        const text = new IText("Edit me", {
          left: x,
          top: y,
          fontSize,
          fill: textColor,
          fontFamily,
          fontWeight: bold ? "bold" : "normal",
          fontStyle: italic ? "italic" : "normal",
          underline,
        });
        fc.add(text);
        fc.setActiveObject(text);
        text.enterEditing();
        fc.renderAll();
      };
      place();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fc.on("mouse:down", handler as any);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fc.off("mouse:down", handler as any);
    };
  }, [activeTool, fontSize, textColor, fontFamily, bold, italic, underline]);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto shadow-2xl mb-6"
      style={{
        width: pageSize.width || 820,
        height: pageSize.height || 1060,
        background: "#fff",
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transition: "transform 0.3s ease",
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
