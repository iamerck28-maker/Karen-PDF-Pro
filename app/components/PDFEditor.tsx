"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Toolbar, { type Tool } from "./Toolbar";
import PDFPage from "./PDFPage";
import ThumbnailSidebar from "./ThumbnailSidebar";
import SignatureModal from "./SignatureModal";

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
  const [textColor, setTextColor] = useState("#111111");
  const [fontFamily, setFontFamily] = useState("Arial");
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [shapeFill, setShapeFill] = useState("transparent");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [deletedPages, setDeletedPages] = useState<Set<number>>(new Set());
  const [pageRotations, setPageRotations] = useState<Map<number, number>>(new Map());
  const pageContainerRef = useRef<HTMLDivElement>(null);

  // Fabric canvases per page (1-indexed)
  const fabricCanvasesRef = useRef<Map<number, FabricCanvas>>(new Map());

  // Undo/redo stacks: array of serialized JSON snapshots
  const undoStacksRef = useRef<Map<number, string[]>>(new Map());
  const redoStacksRef = useRef<Map<number, string[]>>(new Map());
  // Flag to suppress snapshot pushes during undo/redo restore
  const isRestoringRef = useRef<Map<number, boolean>>(new Map());
  const focusedPageRef = useRef<number>(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clipboardRef = useRef<any>(null);

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

  const handleDeletePage = useCallback((pageNum: number) => {
    setDeletedPages(prev => new Set([...prev, pageNum]));
  }, []);

  const handleRotatePage = useCallback((pageNum: number) => {
    setPageRotations(prev => {
      const next = new Map(prev);
      next.set(pageNum, ((prev.get(pageNum) ?? 0) + 90) % 360);
      return next;
    });
  }, []);

  const handleStamp = useCallback(async (text: string, color: string) => {
    const page = focusedPageRef.current;
    const fc = fabricCanvasesRef.current.get(page);
    if (!fc) return;
    const { IText, Rect, Group } = await import("fabric");
    const label = new IText(text, {
      fontSize: 30,
      fontWeight: "bold",
      fill: color,
      fontFamily: "Arial",
      selectable: false,
    });
    const pad = 14;
    const border = new Rect({
      width: (label.width ?? 100) + pad * 2,
      height: (label.height ?? 36) + pad,
      fill: "transparent",
      stroke: color,
      strokeWidth: 3,
      rx: 6, ry: 6,
      left: -pad,
      top: -pad / 2,
      selectable: false,
    });
    const group = new Group([border, label], {
      left: (fc.width ?? 400) / 2 - 80,
      top: (fc.height ?? 500) / 3,
      angle: -15,
      selectable: true,
    });
    fc.add(group);
    fc.setActiveObject(group);
    fc.renderAll();
  }, []);

  const handleApplySignature = useCallback(async (dataUrl: string) => {
    const page = focusedPageRef.current;
    const fc = fabricCanvasesRef.current.get(page);
    if (!fc) return;
    const { FabricImage } = await import("fabric");
    const img = await FabricImage.fromURL(dataUrl);
    const maxW = (fc.width ?? 400) * 0.4;
    const scaleFactor = Math.min(1, maxW / (img.width || 1));
    img.scale(scaleFactor);
    img.set({ left: 80, top: 80 });
    fc.add(img);
    fc.setActiveObject(img);
    fc.renderAll();
    setActiveTool("select");
  }, []);

  const scrollToPage = useCallback((pageNum: number) => {
    const el = pageContainerRef.current?.querySelector(`[data-page="${pageNum}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    focusedPageRef.current = pageNum;
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(3.0, parseFloat((z + 0.25).toFixed(2))));
  }, []);
  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(0.25, parseFloat((z - 0.25).toFixed(2))));
  }, []);
  const handleZoomReset = useCallback(() => setZoom(1.0), []);

  // Keyboard shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z / Ctrl+Y redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.metaKey || e.ctrlKey;

      // Delete / Backspace — remove selected objects
      if (e.key === "Delete" || e.key === "Backspace") {
        const fc = fabricCanvasesRef.current.get(focusedPageRef.current);
        if (!fc) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((fc.getActiveObject() as any)?.isEditing) return;
        const active = fc.getActiveObjects();
        if (active.length === 0) return;
        e.preventDefault();
        fc.remove(...active);
        fc.discardActiveObject();
        fc.renderAll();
        return;
      }

      if (!ctrl) return;

      // Ctrl+C — copy selected object
      if (e.key === "c") {
        const fc = fabricCanvasesRef.current.get(focusedPageRef.current);
        const obj = fc?.getActiveObject();
        if (!obj) return;
        e.preventDefault();
        obj.clone().then((cloned: unknown) => { clipboardRef.current = cloned; });
        return;
      }

      // Ctrl+V — paste copied object
      if (e.key === "v") {
        if (!clipboardRef.current) return;
        e.preventDefault();
        const fc = fabricCanvasesRef.current.get(focusedPageRef.current);
        if (!fc) return;
        clipboardRef.current.clone().then((cloned: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const c = cloned as any;
          c.set({ left: (c.left ?? 0) + 20, top: (c.top ?? 0) + 20 });
          fc.add(c);
          fc.setActiveObject(c);
          fc.renderAll();
          clipboardRef.current = c; // shift clipboard so repeated paste staggers
        });
        return;
      }

      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        handleZoomReset();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, handleZoomIn, handleZoomOut, handleZoomReset]);

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
      const { PDFDocument, degrees } = await import("pdf-lib");
      const srcDoc = await PDFDocument.load(pdfBytes);
      const outDoc = await PDFDocument.create();

      // Copy non-deleted pages in order
      for (let i = 0; i < pdfPages.length; i++) {
        const pageNum = i + 1;
        if (deletedPages.has(pageNum)) continue;
        const [copied] = await outDoc.copyPages(srcDoc, [i]);
        outDoc.addPage(copied);

        // Apply rotation
        const rot = pageRotations.get(pageNum) ?? 0;
        if (rot !== 0) copied.setRotation(degrees(rot));

        // Apply fabric annotations
        const fc = fabricCanvasesRef.current.get(pageNum);
        if (!fc || fc.getObjects().length === 0) continue;
        const dataUrl = fc.toDataURL({ format: "png", multiplier: 1 });
        const base64 = dataUrl.split(",")[1];
        const pngBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const embeddedPng = await outDoc.embedPng(pngBytes);
        const { width, height } = copied.getSize();
        copied.drawImage(embeddedPng, { x: 0, y: 0, width, height });
      }

      const savedBytes = await outDoc.save();
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
  }, [pdfBytes, pdfPages, deletedPages, pageRotations]);

  const effectiveScale = PDF_SCALE * zoom;

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
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(v => !v)}
        onSignatureClick={() => setSignatureOpen(true)}
        onStamp={handleStamp}
        textColor={textColor}
        onTextColorChange={setTextColor}
        fontFamily={fontFamily}
        onFontFamilyChange={setFontFamily}
        bold={bold}
        onBoldToggle={() => setBold(v => !v)}
        italic={italic}
        onItalicToggle={() => setItalic(v => !v)}
        underline={underline}
        onUnderlineToggle={() => setUnderline(v => !v)}
        shapeFill={shapeFill}
        onShapeFillChange={setShapeFill}
      />

      {/* Main area: sidebar + canvas */}
      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && pdfPages.length > 0 && (
          <ThumbnailSidebar
            pages={pdfPages}
            currentPage={focusedPageRef.current}
            onPageClick={scrollToPage}
          />
        )}

      {/* Scrollable canvas area */}
      <div ref={pageContainerRef} className="flex-1 overflow-y-auto bg-gray-800 py-6 px-4">
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

        {pdfPages.map((page, i) => {
          const pageNum = i + 1;
          if (deletedPages.has(pageNum)) return null;
          return (
            <div key={pageNum} className="relative group">
              <PDFPage
                pageNum={pageNum}
                pdfPage={page}
                scale={effectiveScale}
                activeTool={activeTool}
                brushColor={brushColor}
                brushSize={brushSize}
                fontSize={fontSize}
                pendingImage={pendingImage}
                rotation={pageRotations.get(pageNum) ?? 0}
                textColor={textColor}
                fontFamily={fontFamily}
                bold={bold}
                italic={italic}
                underline={underline}
                shapeFill={shapeFill}
                onCanvasReady={handleCanvasReady}
                onFocus={handleFocus}
                onPendingImageConsumed={handlePendingImageConsumed}
              />
              {/* Page action buttons */}
              <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                <button
                  onClick={() => handleRotatePage(pageNum)}
                  className="px-2 py-1 bg-gray-800 bg-opacity-90 text-white text-xs rounded hover:bg-gray-700"
                  title="Rotate 90°"
                >
                  ↻ Rotate
                </button>
                <button
                  onClick={() => handleDeletePage(pageNum)}
                  className="px-2 py-1 bg-red-800 bg-opacity-90 text-white text-xs rounded hover:bg-red-700"
                  title="Delete Page"
                >
                  ✕ Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
      </div>

      {signatureOpen && (
        <SignatureModal
          onApply={handleApplySignature}
          onClose={() => setSignatureOpen(false)}
        />
      )}
    </div>
  );
}
