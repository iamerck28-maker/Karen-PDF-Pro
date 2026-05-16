'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import { useEditor } from './EditorContext';
import { renderPageToCanvas } from '@/lib/pdf-utils';
import { useHistory } from '@/hooks/useHistory';

interface PageCanvasProps {
  pageNumber: number;
}

export function PageCanvas({ pageNumber }: PageCanvasProps) {
  const {
    pdfDoc,
    activeTool,
    setActiveTool,
    brushColor,
    brushWidth,
    fabricCanvases,
    activePage,
    setActivePage,
    zoom,
    textColor,
    fontSize,
    fontFamily,
    bold,
    italic,
    underline,
    shapeFill,
    file,
  } = useEditor();

  const containerRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricInstance = useRef<fabric.Canvas | null>(null);
  const [isVisible, setIsVisible] = useState(pageNumber === 1);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [renderError, setRenderError] = useState(false);
  const [renderKey, setRenderKey] = useState(0); // increment to force re-render
  const { push, undo, redo } = useHistory<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevZoomRef = useRef(zoom);

  // Brush / eraser cursor overlay state
  const [mousePos, setMousePos] = useState({ x: -100, y: -100 });
  const [isHovering, setIsHovering] = useState(false);
  const isRestoringHistory = useRef(false);

  // Shape drawing state (rect / circle / line / arrow)
  const isDrawingShape = useRef(false);
  const shapeStart = useRef<{ x: number; y: number } | null>(null);
  const activeShape = useRef<fabric.Object | null>(null);
  const arrowLine = useRef<fabric.Line | null>(null);

  // Pen tool state
  const penPoints = useRef<{ x: number; y: number }[]>([]);
  const penDots = useRef<fabric.Circle[]>([]);
  const penPreview = useRef<fabric.Line | null>(null);

  // Clipboard for copy/paste (per-page, stored in a module-level ref shared via closure)
  const clipboard = useRef<fabric.Object | null>(null);

  // ── Intersection Observer (lazy load) ────────────────────────────────────
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '400px' },
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ── Init Fabric canvas ────────────────────────────────────────────────────
  const initFabric = useCallback(() => {
    if (!fabricCanvasRef.current || fabricInstance.current || !dimensions.width) return;

    const canvas = new fabric.Canvas(fabricCanvasRef.current, {
      width: dimensions.width,
      height: dimensions.height,
      selection: false,
      isDrawingMode: false,
      allowTouchScrolling: true,
    });

    const saveState = () => {
      if (isRestoringHistory.current) return;
      push(JSON.stringify(canvas.toJSON()));
    };

    canvas.on('path:created', (e: fabric.IEvent & { path?: fabric.Path }) => {
      if (e.path) e.path.set({ fill: 'rgba(0,0,0,0)' });
      saveState();
    });
    canvas.on('object:added', saveState);
    canvas.on('object:modified', saveState);
    canvas.on('object:removed', saveState);

    fabricInstance.current = canvas;
    fabricCanvases.current.set(pageNumber, canvas);

    // Auto-save annotations to localStorage on every change
    if (file) {
      const saveKey = `karen-pdf-${file.name}-${file.size}-page${pageNumber}`;
      const doSave = () => {
        const json = canvas.toJSON();
        if (json) localStorage.setItem(saveKey, JSON.stringify(json));
      };
      canvas.on('object:added', doSave);
      canvas.on('object:modified', doSave);
      canvas.on('object:removed', doSave);
    }

    (canvas as any).historyUndo = () => {
      const state = undo();
      if (state) {
        isRestoringHistory.current = true;
        canvas.loadFromJSON(JSON.parse(state), () => {
          canvas.renderAll();
          isRestoringHistory.current = false;
        });
      }
    };

    (canvas as any).historyRedo = () => {
      const state = redo();
      if (state) {
        isRestoringHistory.current = true;
        canvas.loadFromJSON(JSON.parse(state), () => {
          canvas.renderAll();
          isRestoringHistory.current = false;
        });
      }
    };

    // Restore saved state from localStorage
    if (file) {
      const key = `karen-pdf-${file.name}-${file.size}-page${pageNumber}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        isRestoringHistory.current = true;
        canvas.loadFromJSON(JSON.parse(saved), () => {
          canvas.renderAll();
          isRestoringHistory.current = false;
        });
      }
    }

    saveState();
  }, [dimensions, pageNumber, push, undo, redo, fabricCanvases, file]);

  // ── Load PDF page ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isVisible || !pdfDoc || !pdfCanvasRef.current) return;
    let cancelled = false;
    setRenderError(false);

    renderPageToCanvas(pdfDoc, pageNumber, pdfCanvasRef.current, zoom)
      .then((dims) => {
        if (!cancelled && dims) setDimensions(dims);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(`Page ${pageNumber} render failed:`, err);
          setRenderError(true);
        }
      });

    return () => { cancelled = true; };
  }, [isVisible, pdfDoc, pageNumber, zoom, renderKey]);

  // ── Zoom: resize Fabric canvas and scale objects ──────────────────────────
  useEffect(() => {
    const canvas = fabricInstance.current;
    if (!canvas || !dimensions.width) return;
    const prevZoom = prevZoomRef.current;
    if (prevZoom === zoom) return;
    const ratio = zoom / prevZoom;
    prevZoomRef.current = zoom;

    canvas.setWidth(dimensions.width);
    canvas.setHeight(dimensions.height);
    canvas.getObjects().forEach((obj) => {
      const scaleX = (obj.scaleX ?? 1) * ratio;
      const scaleY = (obj.scaleY ?? 1) * ratio;
      obj.set({
        left: (obj.left ?? 0) * ratio,
        top: (obj.top ?? 0) * ratio,
        scaleX,
        scaleY,
      });
      obj.setCoords();
    });
    canvas.renderAll();
  }, [dimensions, zoom]);

  // ── Sync tools & brush settings ───────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricInstance.current;
    if (!canvas) return;

    const drawingTools = ['draw', 'highlight'];
    canvas.isDrawingMode = drawingTools.includes(activeTool);
    canvas.selection = activeTool === 'select';

    if (canvas.freeDrawingBrush) {
      if (activeTool === 'highlight') {
        canvas.freeDrawingBrush.color = brushColor + '66';
        canvas.freeDrawingBrush.width = Math.max(brushWidth * 2, 20);
      } else {
        canvas.freeDrawingBrush.color = brushColor;
        canvas.freeDrawingBrush.width = brushWidth;
      }
    }

    const cursorMap: Record<string, string> = {
      draw: 'none',
      highlight: 'none',
      eraser: 'none',
      shape: 'crosshair',
      circle: 'crosshair',
      line: 'crosshair',
      arrow: 'crosshair',
      text: 'text',
      pen: 'crosshair',
    };
    const cursor = cursorMap[activeTool] ?? 'default';
    canvas.defaultCursor = cursor;
    canvas.hoverCursor = activeTool === 'select' ? 'move' : cursor;
    canvas.renderAll();
  }, [activeTool, brushColor, brushWidth]);

  // ── Init Fabric after dimensions available ────────────────────────────────
  useEffect(() => {
    if (dimensions.width && !fabricInstance.current) {
      const timer = setTimeout(() => initFabric(), 100);
      return () => clearTimeout(timer);
    }
  }, [dimensions, initFabric]);

  // ── Image upload handler ──────────────────────────────────────────────────
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && fabricInstance.current) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = ev.target?.result as string;
        fabric.Image.fromURL(data, (img) => {
          img.scaleToWidth(200);
          (img as any).set({ globalCompositeOperation: 'multiply' });
          fabricInstance.current?.add(img);
          fabricInstance.current?.centerObject(img);
          fabricInstance.current?.setActiveObject(img);
          fabricInstance.current?.renderAll();
          if (fileInputRef.current) fileInputRef.current.value = '';
        });
      };
      reader.readAsDataURL(f);
    }
  };

  // ── Pen tool: finish path ─────────────────────────────────────────────────
  const finishPen = useCallback(() => {
    const canvas = fabricInstance.current;
    const pts = penPoints.current;
    if (!canvas || pts.length < 2) {
      // Clean up dots/preview regardless
      penDots.current.forEach((d) => canvas?.remove(d));
      penDots.current = [];
      if (penPreview.current) { canvas?.remove(penPreview.current); penPreview.current = null; }
      penPoints.current = [];
      return;
    }

    // Build SVG path string
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const path = new fabric.Path(d, {
      stroke: brushColor,
      strokeWidth: brushWidth,
      fill: 'rgba(0,0,0,0)',
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
    });

    // Remove helpers
    penDots.current.forEach((dot) => canvas.remove(dot));
    penDots.current = [];
    if (penPreview.current) { canvas.remove(penPreview.current); penPreview.current = null; }
    penPoints.current = [];

    canvas.add(path);
    canvas.renderAll();
    setActiveTool('select');
  }, [brushColor, brushWidth, setActiveTool]);

  // ── Main mouse event useEffect ────────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricInstance.current;
    if (!canvas) return;

    const handleMouseDown = (options: any) => {
      setActivePage(pageNumber);
      const pointer = canvas.getPointer(options.e);

      if (activeTool === 'eraser') {
        if (options.target) {
          canvas.remove(options.target);
          if (!isRestoringHistory.current) push(JSON.stringify(canvas.toJSON()));
        }
        return;
      }

      if (activeTool === 'image') {
        if (!options.target) fileInputRef.current?.click();
        return;
      }

      if (activeTool === 'text') {
        const text = new fabric.IText('', {
          left: pointer.x,
          top: pointer.y,
          fontSize,
          fill: textColor,
          fontFamily,
          fontWeight: bold ? 'bold' : 'normal',
          fontStyle: italic ? 'italic' : 'normal',
          underline,
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        canvas.renderAll();
        setActiveTool('select');
        return;
      }

      if (activeTool === 'pen') {
        // Skip on double-click's second mousedown (detail === 2); dblclick handler will finish the path
        if ((options.e as MouseEvent).detail >= 2) return;
        // Add anchor dot
        const dot = new fabric.Circle({
          left: pointer.x - 3,
          top: pointer.y - 3,
          radius: 3,
          fill: brushColor,
          selectable: false,
          evented: false,
        });
        canvas.add(dot);
        penDots.current.push(dot);
        penPoints.current.push({ x: pointer.x, y: pointer.y });
        canvas.renderAll();
        return;
      }

      // Shape tools
      const shapingTools = ['shape', 'circle', 'line', 'arrow'];
      if (shapingTools.includes(activeTool)) {
        isDrawingShape.current = true;
        shapeStart.current = { x: pointer.x, y: pointer.y };

        if (activeTool === 'shape') {
          const rect = new fabric.Rect({
            left: pointer.x,
            top: pointer.y,
            width: 0,
            height: 0,
            fill: brushColor,
            selectable: false,
            evented: false,
            strokeUniform: true,
          });
          canvas.add(rect);
          activeShape.current = rect;
        } else if (activeTool === 'circle') {
          const ellipse = new fabric.Ellipse({
            left: pointer.x,
            top: pointer.y,
            rx: 0,
            ry: 0,
            fill: shapeFill === 'transparent' ? 'rgba(0,0,0,0)' : shapeFill,
            stroke: brushColor,
            strokeWidth: brushWidth,
            selectable: false,
            evented: false,
            strokeUniform: true,
          });
          canvas.add(ellipse);
          activeShape.current = ellipse;
        } else if (activeTool === 'line' || activeTool === 'arrow') {
          const line = new fabric.Line(
            [pointer.x, pointer.y, pointer.x, pointer.y],
            {
              stroke: brushColor,
              strokeWidth: brushWidth,
              selectable: false,
              evented: false,
              strokeLineCap: 'round',
            },
          );
          canvas.add(line);
          activeShape.current = line;
          if (activeTool === 'arrow') arrowLine.current = line;
        }
      }
    };

    const handleMouseMove = (options: any) => {
      const canvas = fabricInstance.current;
      if (!canvas) return;
      const pointer = canvas.getPointer(options.e);

      // Pen preview
      if (activeTool === 'pen' && penPoints.current.length > 0) {
        const last = penPoints.current[penPoints.current.length - 1];
        if (penPreview.current) canvas.remove(penPreview.current);
        const preview = new fabric.Line([last.x, last.y, pointer.x, pointer.y], {
          stroke: brushColor,
          strokeWidth: brushWidth,
          strokeDashArray: [5, 5],
          selectable: false,
          evented: false,
        });
        canvas.add(preview);
        penPreview.current = preview;
        canvas.renderAll();
        return;
      }

      if (!isDrawingShape.current || !shapeStart.current || !activeShape.current) return;

      const { x: sx, y: sy } = shapeStart.current;

      if (activeTool === 'shape') {
        const rect = activeShape.current as fabric.Rect;
        rect.set({
          left: Math.min(sx, pointer.x),
          top: Math.min(sy, pointer.y),
          width: Math.abs(pointer.x - sx),
          height: Math.abs(pointer.y - sy),
        });
      } else if (activeTool === 'circle') {
        const ellipse = activeShape.current as fabric.Ellipse;
        const rx = Math.abs(pointer.x - sx) / 2;
        const ry = Math.abs(pointer.y - sy) / 2;
        ellipse.set({
          left: Math.min(sx, pointer.x),
          top: Math.min(sy, pointer.y),
          rx,
          ry,
        });
      } else if (activeTool === 'line' || activeTool === 'arrow') {
        const line = activeShape.current as fabric.Line;
        line.set({ x2: pointer.x, y2: pointer.y });
      }

      canvas.renderAll();
    };

    const handleMouseUp = (options: any) => {
      const canvas = fabricInstance.current;
      if (!canvas) return;

      if (activeTool === 'arrow' && isDrawingShape.current && arrowLine.current && shapeStart.current) {
        const pointer = canvas.getPointer(options.e);
        const { x: sx, y: sy } = shapeStart.current;
        const ex = pointer.x;
        const ey = pointer.y;

        canvas.remove(arrowLine.current);
        arrowLine.current = null;

        const dx = ex - sx;
        const dy = ey - sy;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 5) {
          const arrowSize = Math.max(brushWidth * 4, 14);
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

          const line = new fabric.Line([sx, sy, ex, ey], {
            stroke: brushColor,
            strokeWidth: brushWidth,
            strokeLineCap: 'round',
            selectable: false,
            evented: false,
          });
          const head = new fabric.Triangle({
            width: arrowSize,
            height: arrowSize,
            fill: brushColor,
            left: ex,
            top: ey,
            angle: angle + 90,
            originX: 'center',
            originY: 'center',
            selectable: false,
            evented: false,
          });
          const group = new fabric.Group([line, head], { selectable: true, evented: true });
          canvas.add(group);
          canvas.setActiveObject(group);
          canvas.renderAll();
          if (!isRestoringHistory.current) push(JSON.stringify(canvas.toJSON()));
        }

        isDrawingShape.current = false;
        shapeStart.current = null;
        activeShape.current = null;
        setActiveTool('select');
        return;
      }

      const shapingTools = ['shape', 'circle', 'line'];
      if (!shapingTools.includes(activeTool) || !isDrawingShape.current) return;

      isDrawingShape.current = false;

      if (activeShape.current) {
        const obj = activeShape.current;
        let tooSmall = false;

        if (activeTool === 'shape') {
          const r = obj as fabric.Rect;
          tooSmall = (r.width ?? 0) < 3 || (r.height ?? 0) < 3;
        } else if (activeTool === 'circle') {
          const e = obj as fabric.Ellipse;
          tooSmall = (e.rx ?? 0) < 2 || (e.ry ?? 0) < 2;
        } else if (activeTool === 'line') {
          const l = obj as fabric.Line;
          const dx = (l.x2 ?? 0) - (l.x1 ?? 0);
          const dy = (l.y2 ?? 0) - (l.y1 ?? 0);
          tooSmall = Math.sqrt(dx * dx + dy * dy) < 5;
        }

        if (tooSmall) {
          canvas.remove(obj);
        } else {
          obj.set({ selectable: true, evented: true });
          canvas.setActiveObject(obj);
          canvas.renderAll();
          if (!isRestoringHistory.current) push(JSON.stringify(canvas.toJSON()));
        }

        activeShape.current = null;
      }

      shapeStart.current = null;
      if (activeTool !== 'pen') setActiveTool('select');
    };

    const handleDblClick = () => {
      if (activeTool === 'pen') {
        finishPen();
      }
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);
    canvas.on('mouse:dblclick', handleDblClick);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
      canvas.off('mouse:dblclick', handleDblClick);
    };
  }, [
    activeTool, brushColor, brushWidth, shapeFill,
    textColor, fontSize, fontFamily, bold, italic, underline,
    pageNumber, setActivePage, setActiveTool, push, finishPen,
  ]);

  // ── Keyboard shortcuts (Delete, Ctrl+C/V) ─────────────────────────────────
  useEffect(() => {
    if (activePage !== pageNumber) return;
    const canvas = fabricInstance.current;
    if (!canvas) return;

    const handleKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const obj = canvas.getActiveObject();
        if (obj) { canvas.remove(obj); canvas.renderAll(); }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const obj = canvas.getActiveObject();
        if (obj) {
          obj.clone((cloned: fabric.Object) => { clipboard.current = cloned; });
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (clipboard.current) {
          clipboard.current.clone((cloned: fabric.Object) => {
            cloned.set({ left: (cloned.left ?? 0) + 10, top: (cloned.top ?? 0) + 10 });
            canvas.add(cloned);
            canvas.setActiveObject(cloned);
            canvas.renderAll();
          });
        }
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [activePage, pageNumber]);

  // ── Render ────────────────────────────────────────────────────────────────
  const isDrawOrErase = activeTool === 'draw' || activeTool === 'eraser' || activeTool === 'highlight';

  return (
    <div
      ref={containerRef}
      className={`relative mb-8 mx-auto canvas-container bg-slate-50 dark:bg-slate-900 overflow-hidden transition-all duration-300 ${
        activePage === pageNumber
          ? 'ring-2 ring-primary ring-offset-2 dark:ring-offset-slate-900'
          : 'opacity-90 hover:opacity-100'
      } ${isDrawOrErase ? 'cursor-none' : ''}`}
      style={{
        width: dimensions.width || '100%',
        height: dimensions.height || 'auto',
        minHeight: dimensions.height ? `${dimensions.height}px` : '300px',
        maxWidth: '100%',
        touchAction:
          activeTool === 'draw' || activeTool === 'eraser' || activeTool === 'shape' ||
          activeTool === 'circle' || activeTool === 'line' || activeTool === 'arrow' ||
          activeTool === 'highlight'
            ? 'none'
            : 'auto',
      }}
      onMouseEnter={() => { setActivePage(pageNumber); setIsHovering(true); }}
      onMouseLeave={() => setIsHovering(false)}
      onMouseMove={(e) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
    >
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />

      {/* Brush cursor */}
      {isHovering && (activeTool === 'draw' || activeTool === 'highlight') && (
        <div
          className="absolute z-50 rounded-full border border-black/30 dark:border-white/50 pointer-events-none"
          style={{
            width: `${activeTool === 'highlight' ? Math.max(brushWidth * 2, 20) : brushWidth}px`,
            height: `${activeTool === 'highlight' ? Math.max(brushWidth * 2, 20) : brushWidth}px`,
            backgroundColor:
              activeTool === 'highlight' ? brushColor + '44' : 'rgba(128,128,128,0.4)',
            left: `${mousePos.x}px`,
            top: `${mousePos.y}px`,
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}

      {/* Eraser cursor */}
      {isHovering && activeTool === 'eraser' && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: `${mousePos.x}px`,
            top: `${mousePos.y}px`,
            transform: 'translate(-50%, -80%)',
          }}
        >
          <div className="bg-destructive text-white p-1 rounded-md shadow-sm opacity-90 animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
              <path d="M22 21H7" /><path d="m5 11 9 9" />
            </svg>
          </div>
        </div>
      )}

      {isVisible ? (
        <div className="relative w-full h-full flex items-center justify-center bg-white dark:bg-slate-800">
          <canvas ref={pdfCanvasRef} className="absolute inset-0 z-0 shadow-sm" />
          <div className="absolute inset-0 z-10 w-full h-full">
            <canvas ref={fabricCanvasRef} />
          </div>
          {renderError && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/90 dark:bg-slate-900/90 gap-3 p-4">
              <p className="text-sm text-destructive font-semibold text-center">
                Gagal memuat halaman {pageNumber}
              </p>
              <button
                onClick={() => setRenderKey((k) => k + 1)}
                className="px-4 py-2 text-sm font-semibold bg-black text-white dark:bg-white dark:text-black rounded-xl hover:opacity-80 transition-opacity"
              >
                Coba Lagi
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-[300px] w-full text-muted-foreground animate-pulse gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-xs font-semibold tracking-widest uppercase">Loading Page {pageNumber}</span>
        </div>
      )}

      <div className="absolute top-2 left-2 px-2 py-1 glass text-[10px] font-bold rounded-md z-20 pointer-events-none">
        PAGE {pageNumber}
      </div>
    </div>
  );
}
