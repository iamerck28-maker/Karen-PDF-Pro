"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Toolbar, { type Tool } from "./Toolbar";
import PDFPage from "./PDFPage";

type FabricCanvas = import("fabric").Canvas;
type PDFDocumentProxy = import("pdfjs-dist").PDFDocumentProxy;
type PDFPageProxy = import("pdfjs-dist").PDFPageProxy;

const PDF_SCALE = 1.5;

export default function PDFEditor() {
  // PDF state
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfPages, setPdfPages] = useState<PDFPageProxy[]>([]);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Tool state
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [brushColor, setBrushColor] = useState("#e53e3e");
  const [brushSize, setBrushSize] = useState(4);
  const [fontSize, setFontSize] = useState(24);
  const [pendingImage, setPendingImage] = useState<string | null>(null);

  // Fabric canvases per page (1-indexed)
  const fabricCanvasesRef = useRef<Map<number, FabricCanvas>>(new Map());

  // Undo/redo stacks: array of serialized JSON snapshots
  const undoStacksRef = useRef<Map<number, string[]>>(new Map());
  const redoStacksRef = useRef<Map<number, string[]>>(new Map());
  // Flag to suppress snapshot pushes during undo/redo restore
  const isRestoringRef = useRef<Map<number, boolean>>(new Map());
  const focusedPageRef = useRef<number>(1);

  const [isExporting, setIsExporting] = useState(false);

  // ── PDF Loading ──────────────────────────────────────────────────────────
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setLoadError(null);
      setIsLoading(true);
      setPdfDoc(null);
      setPdfPages([]);
      setPdfBytes(null);
      fabricCanvasesRef.current.clear();
      undoStacksRef.current.clear();
      redoStacksRef.current.clear();
      isRestoringRef.current.clear();

      try {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        setPdfBytes(bytes);

        const pdfjsLib = await import("pdfjs-dist");

        // Pre-seed globalThis.pdfjsWorker so PDF.js uses its main-thread
        // fake-worker path instead of spawning a Web Worker. This avoids
        // mobile browser issues with module workers (iOS Safari, MIME types
        // on CDN/Vercel). The trade-off is that PDF parsing runs on the main
        // thread, which is fine for interactive single-file use.
        if (!("pdfjsWorker" in globalThis)) {
          const workerMod = await import(
            "pdfjs-dist/build/pdf.worker.min.mjs"
          );
          (globalThis as Record<string, unknown>).pdfjsWorker = workerMod;
        }

        const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
        setPdfDoc(doc);

        const pages: PDFPageProxy[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          pages.push(await doc.getPage(i));
        }
        setPdfPages(pages);
      } catch (err) {
        setLoadError(`Failed to load PDF: ${(err as Error).message}`);
      } finally {
        setIsLoading(false);
        e.target.value = "";
      }
    },
    []
  );

  // ── Fabric canvas registration ───────────────────────────────────────────
  const handleCanvasReady = useCallback((pageNum: number, fc: FabricCanvas) => {
    fabricCanvasesRef.current.set(pageNum, fc);
    isRestoringRef.current.set(pageNum, false);

    // Seed undo stack with the initial empty canvas state
    const initial = JSON.stringify(fc.toObject());
    undoStacksRef.current.set(pageNum, [initial]);
    redoStacksRef.current.set(pageNum, []);

    const pushSnapshot = () => {
      if (isRestoringRef.current.get(pageNum)) return;
      const json = JSON.stringify(fc.toObject());
      const stack = undoStacksRef.current.get(pageNum) ?? [];
      if (stack[stack.length - 1] !== json) {
        stack.push(json);
        undoStacksRef.current.set(pageNum, stack);
        redoStacksRef.current.set(pageNum, []); // clear redo on new action
      }
    };

    fc.on("object:added", pushSnapshot);
    fc.on("object:removed", pushSnapshot);
    fc.on("object:modified", pushSnapshot);
    fc.on("path:created", pushSnapshot);
  }, []);

  const handleFocus = useCallback((pageNum: number) => {
    focusedPageRef.current = pageNum;
  }, []);

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    const page = focusedPageRef.current;
    const fc = fabricCanvasesRef.current.get(page);
    if (!fc) return;
    const undoStack = undoStacksRef.current.get(page) ?? [];
    const redoStack = redoStacksRef.current.get(page) ?? [];
    if (undoStack.length <= 1) return;

    const current = undoStack.pop()!;
    redoStack.push(current);
    undoStacksRef.current.set(page, undoStack);
    redoStacksRef.current.set(page, redoStack);

    const prev = undoStack[undoStack.length - 1];
    isRestoringRef.current.set(page, true);
    fc.loadFromJSON(JSON.parse(prev)).then(() => {
      fc.renderAll();
      isRestoringRef.current.set(page, false);
    });
  }, []);

  const redo = useCallback(() => {
    const page = focusedPageRef.current;
    const fc = fabricCanvasesRef.current.get(page);
    if (!fc) return;
    const undoStack = undoStacksRef.current.get(page) ?? [];
    const redoStack = redoStacksRef.current.get(page) ?? [];
    if (redoStack.length === 0) return;

    const next = redoStack.pop()!;
    undoStack.push(next);
    undoStacksRef.current.set(page, undoStack);
    redoStacksRef.current.set(page, redoStack);

    isRestoringRef.current.set(page, true);
    fc.loadFromJSON(JSON.parse(next)).then(() => {
      fc.renderAll();
      isRestoringRef.current.set(page, false);
    });
  }, []);

  // Keyboard shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z / Ctrl+Y redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.metaKey || e.ctrlKey;
      if (!ctrl) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  // ── Image upload ─────────────────────────────────────────────────────────
  const handleImageUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const targetPage = focusedPageRef.current;
      const fc = fabricCanvasesRef.current.get(targetPage);
      if (!fc) {
        // Canvas not yet ready — store as pending for the first available page
        setPendingImage(dataUrl);
        return;
      }
      const { FabricImage } = await import("fabric");
      const img = await FabricImage.fromURL(dataUrl);
      const maxW = (fc.width ?? 400) * 0.5;
      const scaleFactor = Math.min(1, maxW / (img.width || 1));
      img.scale(scaleFactor);
      img.set({ left: 50, top: 50, globalCompositeOperation: "multiply" });
      fc.add(img);
      fc.setActiveObject(img);
      fc.renderAll();
      setActiveTool("select");
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePendingImageConsumed = useCallback(() => {
    setPendingImage(null);
    setActiveTool("select");
  }, []);

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!pdfBytes || pdfPages.length === 0) return;
    setIsExporting(true);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdfLibDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfLibDoc.getPages();

      for (let i = 0; i < pdfPages.length; i++) {
        const fc = fabricCanvasesRef.current.get(i + 1);
        if (!fc || fc.getObjects().length === 0) continue;

        // Rasterize the Fabric overlay (transparent background)
        const dataUrl = fc.toDataURL({ format: "png", multiplier: 1 });
        const base64 = dataUrl.split(",")[1];
        const pngBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

        const embeddedPng = await pdfLibDoc.embedPng(pngBytes);
        const pdfPage = pages[i];
        const { width, height } = pdfPage.getSize();
        pdfPage.drawImage(embeddedPng, { x: 0, y: 0, width, height });
      }

      const savedBytes = await pdfLibDoc.save();
      const blob = new Blob([savedBytes as BlobPart], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "annotated.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export failed: ${(err as Error).message}`);
    } finally {
      setIsExporting(false);
    }
  }, [pdfBytes, pdfPages]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-950 border-b border-gray-800 shrink-0">
        <h1 className="text-base font-bold text-white tracking-tight">
          Karen PDF Pro
        </h1>
        <label className="cursor-pointer">
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileUpload}
          />
          <span className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-sm rounded transition-colors">
            Open PDF
          </span>
        </label>
        {pdfDoc && (
          <span className="text-gray-400 text-sm">
            {pdfDoc.numPages} page{pdfDoc.numPages !== 1 ? "s" : ""}
          </span>
        )}
        {isLoading && (
          <span className="text-yellow-400 text-sm animate-pulse">
            Loading…
          </span>
        )}
        {loadError && (
          <span className="text-red-400 text-sm truncate max-w-xs">
            {loadError}
          </span>
        )}
      </div>

      {/* Toolbar */}
      <Toolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        brushColor={brushColor}
        onBrushColorChange={setBrushColor}
        brushSize={brushSize}
        onBrushSizeChange={setBrushSize}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        onImageUpload={handleImageUpload}
        onUndo={undo}
        onRedo={redo}
        onExport={handleExport}
        hasPdf={pdfPages.length > 0}
        isExporting={isExporting}
      />

      {/* Scrollable canvas area */}
      <div className="flex-1 overflow-y-auto bg-gray-800 py-6 px-4">
        {!pdfDoc && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
            <div className="text-6xl opacity-20 select-none">📄</div>
            <p className="text-xl font-medium">Open a PDF to get started</p>
            <label className="cursor-pointer px-6 py-3 bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors">
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileUpload}
              />
              Choose PDF file
            </label>
          </div>
        )}

        {pdfPages.map((page, i) => (
          <PDFPage
            key={i + 1}
            pageNum={i + 1}
            pdfPage={page}
            scale={PDF_SCALE}
            activeTool={activeTool}
            brushColor={brushColor}
            brushSize={brushSize}
            fontSize={fontSize}
            pendingImage={pendingImage}
            onCanvasReady={handleCanvasReady}
            onFocus={handleFocus}
            onPendingImageConsumed={handlePendingImageConsumed}
          />
        ))}
      </div>
    </div>
  );
}
