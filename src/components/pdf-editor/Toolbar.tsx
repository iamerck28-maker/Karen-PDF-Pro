'use client';

import React, { useRef, useState } from 'react';
import { fabric } from 'fabric';
import { useEditor } from './EditorContext';
import {
  MousePointer2, Pencil, Image as ImageIcon, Undo2, Redo2,
  Download, Plus, Minus, Sun, Moon, Eraser, Check, Loader2,
  PenTool, Trash2, Square, Circle, Minus as LineIcon, ArrowRight,
  Highlighter, Type, Stamp, ZoomIn, ZoomOut, RefreshCw, Camera,
} from 'lucide-react';
import { SignatureModal } from './SignatureModal';
import { cn } from '@/lib/utils';
import { exportPdf, createCombinedPagePng } from '@/lib/pdf-utils';

const STAMPS = [
  { text: 'APPROVED',     color: '#16a34a' },
  { text: 'DRAFT',        color: '#6b7280' },
  { text: 'CONFIDENTIAL', color: '#dc2626' },
  { text: 'REJECTED',     color: '#dc2626' },
  { text: 'REVIEWED',     color: '#2563eb' },
  { text: 'VOID',         color: '#9333ea' },
];

const FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Helvetica'];

export function Toolbar() {
  const {
    activeTool, setActiveTool,
    brushColor, setBrushColor,
    brushWidth, setBrushWidth,
    file, pdfDoc, numPages,
    fabricCanvases, activePage,
    theme, setTheme,
    signatures, setSignatures,
    zoom, setZoom,
    textColor, setTextColor,
    fontSize, setFontSize,
    fontFamily, setFontFamily,
    bold, setBold,
    italic, setItalic,
    underline, setUnderline,
    shapeFill, setShapeFill,
  } = useEditor();

  const imageInputRef = useRef<HTMLInputElement>(null);
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'success'>('idle');
  const [pngState, setPngState] = useState<'idle' | 'exporting' | 'success'>('idle');
  const [showSignatureMenu, setShowSignatureMenu] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showStampMenu, setShowStampMenu] = useState(false);

  const insertSignature = (dataUrl: string) => {
    const pageIdx = activePage || 1;
    const canvas = fabricCanvases.current.get(pageIdx);
    if (!canvas) return;
    fabric.Image.fromURL(dataUrl, (img) => {
      img.scaleToWidth(150);
      (img as any).set({ globalCompositeOperation: 'multiply' });
      canvas.add(img);
      canvas.centerObject(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
      setActiveTool('select');
      setShowSignatureMenu(false);
    });
  };

  const deleteSignature = (idx: number) => {
    const newSigs = [...signatures];
    newSigs.splice(idx, 1);
    setSignatures(newSigs);
  };

  const addStamp = (text: string, color: string) => {
    const pageIdx = activePage || 1;
    const canvas = fabricCanvases.current.get(pageIdx);
    if (!canvas) return;
    const stamp = new fabric.IText(text, {
      left: (canvas.width ?? 400) / 2,
      top: (canvas.height ?? 400) / 2,
      fontSize: 48,
      fill: color,
      fontWeight: 'bold',
      opacity: 0.75,
      angle: -30,
      originX: 'center',
      originY: 'center',
      stroke: color,
      strokeWidth: 1,
    } as any);
    canvas.add(stamp);
    canvas.setActiveObject(stamp);
    canvas.renderAll();
    setShowStampMenu(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const pageIdx = activePage || 1;
      const canvas = fabricCanvases.current.get(pageIdx);
      if (!canvas) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = ev.target?.result as string;
        fabric.Image.fromURL(data, (img) => {
          img.scaleToWidth(200);
          (img as any).set({ globalCompositeOperation: 'multiply' });
          canvas.add(img);
          canvas.centerObject(img);
          canvas.setActiveObject(img);
          canvas.renderAll();
          if (imageInputRef.current) imageInputRef.current.value = '';
          setActiveTool('select');
        });
      };
      reader.readAsDataURL(f);
    }
  };

  const triggerUndo = () => {
    const canvas = fabricCanvases.current.get(activePage || 1) as any;
    if (canvas?.historyUndo) canvas.historyUndo();
  };

  const triggerRedo = () => {
    const canvas = fabricCanvases.current.get(activePage || 1) as any;
    if (canvas?.historyRedo) canvas.historyRedo();
  };

  const handleZoomIn  = () => setZoom(Math.min(zoom + 0.25, 3));
  const handleZoomOut = () => setZoom(Math.max(zoom - 0.25, 0.5));
  const handleZoomReset = () => setZoom(1);

  const handleExport = async () => {
    if (!file || !pdfDoc || exportState === 'exporting') return;
    setExportState('exporting');

    const totalPages = pdfDoc.numPages;
    const states: (string | null)[] = new Array(totalPages).fill(null);

    for (const [pageIdx, fabricCanvas] of fabricCanvases.current) {
      const origBg = fabricCanvas.backgroundColor;
      fabricCanvas.backgroundColor = '';
      fabricCanvas.renderAll();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lowerEl = (fabricCanvas as any).lowerCanvasEl as HTMLCanvasElement;
      states[pageIdx - 1] = await createCombinedPagePng(pdfDoc, pageIdx, lowerEl);

      fabricCanvas.backgroundColor = origBg;
      fabricCanvas.renderAll();
    }

    const blob = await exportPdf(file, states);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edited_${file.name}`;
    a.click();
    URL.revokeObjectURL(url);
    setExportState('success');
    setTimeout(() => setExportState('idle'), 2000);
  };

  const handleExportPNG = async () => {
    if (!pdfDoc || pngState === 'exporting') return;
    setPngState('exporting');
    try {
      for (let pageIdx = 1; pageIdx <= numPages; pageIdx++) {
        const fabricCanvas = fabricCanvases.current.get(pageIdx);
        if (!fabricCanvas) continue;

        const origBg = fabricCanvas.backgroundColor;
        fabricCanvas.backgroundColor = '';
        fabricCanvas.renderAll();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lowerEl = (fabricCanvas as any).lowerCanvasEl as HTMLCanvasElement;
        const dataUrl = await createCombinedPagePng(pdfDoc, pageIdx, lowerEl);
        fabricCanvas.backgroundColor = origBg;
        fabricCanvas.renderAll();

        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `page_${pageIdx}.png`;
        a.click();
        if (numPages > 1) await new Promise((r) => setTimeout(r, 200));
      }
      setPngState('success');
      setTimeout(() => setPngState('idle'), 2000);
    } catch {
      setPngState('idle');
    }
  };

  // ── Shared sub-panels ─────────────────────────────────────────────────────

  const signatureMenu = (upward = false) =>
    showSignatureMenu ? (
      <div
        className={cn(
          'absolute left-0 w-64 bg-white dark:bg-slate-900 border dark:border-white/10 rounded-2xl shadow-2xl p-2 z-[60] flex flex-col gap-2',
          upward ? 'bottom-14' : 'top-14',
        )}
      >
        <div className="text-xs font-bold text-muted-foreground uppercase px-2 pt-1">Saved Signatures</div>
        {signatures.length === 0 ? (
          <div className="text-sm text-center text-muted-foreground p-4">No signatures yet</div>
        ) : (
          <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
            {signatures.map((sig, idx) => (
              <div
                key={idx}
                className="group relative flex flex-row items-center px-3 py-2 bg-slate-50 dark:bg-black/20 rounded-xl border border-transparent hover:border-black/10 dark:hover:border-white/10 cursor-pointer"
                onClick={() => insertSignature(sig)}
              >
                <span className="text-xs font-bold text-muted-foreground w-5 flex-shrink-0">{idx + 1}.</span>
                <div className="flex-1 flex justify-center items-center px-2 mr-6">
                  <img src={sig} alt={`Signature ${idx + 1}`} className="h-10 object-contain mix-blend-multiply dark:mix-blend-normal dark:invert" />
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSignature(idx); }}
                  className="absolute right-2 p-1.5 bg-destructive text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-md"
                  title="Delete Signature"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="h-[1px] bg-black/5 dark:bg-white/10 my-1" />
        <button
          onClick={() => { setShowSignatureMenu(false); setShowSignatureModal(true); }}
          className="w-full py-2 text-sm font-semibold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl transition-colors"
        >
          Create New Signature
        </button>
      </div>
    ) : null;

  const stampMenu = (upward = false) =>
    showStampMenu ? (
      <div
        className={cn(
          'absolute left-0 w-44 bg-white dark:bg-slate-900 border dark:border-white/10 rounded-2xl shadow-2xl p-2 z-[60] flex flex-col gap-1',
          upward ? 'bottom-14' : 'top-14',
        )}
      >
        {STAMPS.map((s) => (
          <button
            key={s.text}
            onClick={() => addStamp(s.text, s.color)}
            className="text-left px-3 py-1.5 text-sm font-bold rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            style={{ color: s.color }}
          >
            {s.text}
          </button>
        ))}
      </div>
    ) : null;

  const brushControls = (
    <div className="flex items-center gap-2 px-3 py-1.5 ml-1 bg-black/5 dark:bg-white/5 rounded-2xl flex-shrink-0">
      <input
        type="color"
        value={brushColor}
        onChange={(e) => setBrushColor(e.target.value)}
        className="w-7 h-7 rounded-full border-0 cursor-pointer overflow-hidden p-0 bg-transparent ring-2 ring-primary/20"
      />
      <div className="flex items-center gap-1">
        <button onClick={() => setBrushWidth(Math.max(1, brushWidth - 1))} className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"><Minus size={14} /></button>
        <span className="text-xs font-semibold w-5 text-center">{brushWidth}</span>
        <button onClick={() => setBrushWidth(Math.min(50, brushWidth + 1))} className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"><Plus size={14} /></button>
      </div>
    </div>
  );

  const shapeControls = (
    <div className="flex items-center gap-2 px-3 py-1.5 ml-1 bg-black/5 dark:bg-white/5 rounded-2xl flex-shrink-0">
      <label className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
        Stroke
        <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className="w-7 h-7 rounded-full border-0 cursor-pointer p-0 bg-transparent ring-2 ring-primary/20" />
      </label>
      <label className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
        Fill
        <input
          type="color"
          value={shapeFill === 'transparent' ? '#ffffff' : shapeFill}
          onChange={(e) => setShapeFill(e.target.value)}
          className="w-7 h-7 rounded-full border-0 cursor-pointer p-0 bg-transparent ring-2 ring-primary/20"
        />
        <button
          onClick={() => setShapeFill('transparent')}
          className={cn('text-xs px-1.5 py-0.5 rounded-lg transition-colors', shapeFill === 'transparent' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-black/10 dark:bg-white/10')}
          title="No fill"
        >∅</button>
      </label>
    </div>
  );

  const textControls = (
    <div className="flex items-center gap-2 px-3 py-1.5 ml-1 bg-black/5 dark:bg-white/5 rounded-2xl flex-shrink-0 flex-wrap">
      <select
        value={fontFamily}
        onChange={(e) => setFontFamily(e.target.value)}
        className="bg-transparent text-xs font-semibold border border-black/20 dark:border-white/20 rounded-lg px-1.5 py-1 outline-none"
      >
        {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <div className="flex items-center gap-1">
        <button onClick={() => setFontSize(Math.max(8, fontSize - 2))} className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"><Minus size={12} /></button>
        <span className="text-xs font-semibold w-6 text-center">{fontSize}</span>
        <button onClick={() => setFontSize(Math.min(96, fontSize + 2))} className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"><Plus size={12} /></button>
      </div>
      <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-7 h-7 rounded-full border-0 cursor-pointer p-0 bg-transparent ring-2 ring-primary/20" title="Text color" />
      <button onClick={() => setBold(!bold)} className={cn('px-2 py-1 rounded-lg text-xs font-bold transition-colors', bold ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-black/10 dark:hover:bg-white/10')}>B</button>
      <button onClick={() => setItalic(!italic)} className={cn('px-2 py-1 rounded-lg text-xs italic transition-colors', italic ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-black/10 dark:hover:bg-white/10')}>I</button>
      <button onClick={() => setUnderline(!underline)} className={cn('px-2 py-1 rounded-lg text-xs underline transition-colors', underline ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-black/10 dark:hover:bg-white/10')}>U</button>
    </div>
  );

  const zoomControls = (
    <div className="flex items-center gap-1 px-2 py-1 bg-black/5 dark:bg-white/5 rounded-2xl flex-shrink-0">
      <button onClick={handleZoomOut} className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors" title="Zoom Out"><ZoomOut size={14} /></button>
      <button onClick={handleZoomReset} className="text-xs font-semibold w-10 text-center hover:bg-black/10 dark:hover:bg-white/10 rounded-lg py-1 transition-colors" title="Reset Zoom">{Math.round(zoom * 100)}%</button>
      <button onClick={handleZoomIn} className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors" title="Zoom In"><ZoomIn size={14} /></button>
    </div>
  );

  const exportButton = (compact = false) => (
    <button
      onClick={handleExport}
      disabled={!file || exportState === 'exporting'}
      className={cn(
        'flex items-center gap-1.5 rounded-xl text-sm font-semibold shadow-lg shadow-black/10 transition-all duration-300 ease-out justify-center overflow-hidden',
        compact ? 'px-3 py-1.5' : 'px-4 py-2 w-[110px]',
        (!file || exportState === 'exporting')
          ? 'opacity-60 cursor-not-allowed bg-black text-white dark:bg-white dark:text-black'
          : 'bg-black text-white dark:bg-white dark:text-black hover:-translate-y-0.5 hover:shadow-xl active:scale-95 active:translate-y-0',
        exportState === 'success' && 'bg-green-500 text-white dark:bg-green-500 dark:text-white',
      )}
    >
      {exportState === 'exporting' ? <Loader2 size={15} className="animate-spin" /> : exportState === 'success' ? <Check size={15} /> : <Download size={15} />}
      {!compact && <span className="flex-1 text-center">{exportState === 'exporting' ? 'Exporting...' : exportState === 'success' ? 'Done' : 'Export'}</span>}
    </button>
  );

  const pngButton = (compact = false) => (
    <button
      onClick={handleExportPNG}
      disabled={!file || pngState === 'exporting'}
      className={cn(
        'flex items-center gap-1.5 rounded-xl text-sm font-semibold shadow-lg shadow-black/10 transition-all duration-300 ease-out justify-center overflow-hidden bg-teal-600 text-white hover:-translate-y-0.5 hover:shadow-xl active:scale-95',
        compact ? 'px-3 py-1.5' : 'px-4 py-2',
        (!file || pngState === 'exporting') && 'opacity-60 cursor-not-allowed',
        pngState === 'success' && 'bg-green-500',
      )}
      title="Export as PNG"
    >
      {pngState === 'exporting' ? <Loader2 size={15} className="animate-spin" /> : pngState === 'success' ? <Check size={15} /> : <Camera size={15} />}
      {!compact && <span>{pngState === 'exporting' ? 'Saving...' : 'PNG'}</span>}
    </button>
  );

  // ── Tool groups ───────────────────────────────────────────────────────────

  const drawTools = (
    <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-2xl">
      <ToolButton active={activeTool === 'select'}    onClick={() => setActiveTool('select')}    icon={<MousePointer2 size={17} />} label="Select" />
      <ToolButton active={activeTool === 'draw'}      onClick={() => setActiveTool('draw')}      icon={<Pencil size={17} />}        label="Draw" />
      <ToolButton active={activeTool === 'highlight'} onClick={() => setActiveTool('highlight')} icon={<Highlighter size={17} />}   label="Highlight" />
      <ToolButton active={activeTool === 'eraser'}    onClick={() => setActiveTool('eraser')}    icon={<Eraser size={17} />}        label="Eraser" />
    </div>
  );

  const shapeTools = (
    <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-2xl">
      <ToolButton active={activeTool === 'shape'}  onClick={() => setActiveTool('shape')}  icon={<Square size={17} />}    label="Rectangle" />
      <ToolButton active={activeTool === 'circle'} onClick={() => setActiveTool('circle')} icon={<Circle size={17} />}    label="Circle" />
      <ToolButton active={activeTool === 'line'}   onClick={() => setActiveTool('line')}   icon={<LineIcon size={17} />}  label="Line" />
      <ToolButton active={activeTool === 'arrow'}  onClick={() => setActiveTool('arrow')}  icon={<ArrowRight size={17} />} label="Arrow" />
      <ToolButton active={activeTool === 'pen'}    onClick={() => setActiveTool('pen')}    icon={<PenTool size={17} />}   label="Pen (click points, dblclick finish)" />
    </div>
  );

  const contentTools = (
    <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-2xl">
      <ToolButton active={activeTool === 'text'} onClick={() => setActiveTool('text')} icon={<Type size={17} />} label="Text" />
      <ToolButton
        active={activeTool === 'image'}
        onClick={() => { setActiveTool('image'); imageInputRef.current?.click(); }}
        icon={<ImageIcon size={17} />}
        label="Image"
      />
      <div className="relative">
        <ToolButton active={showSignatureMenu} onClick={() => { setShowSignatureMenu(!showSignatureMenu); setShowStampMenu(false); }} icon={<PenTool size={17} />} label="Signatures" />
        {signatureMenu(false)}
      </div>
      <div className="relative">
        <ToolButton active={showStampMenu} onClick={() => { setShowStampMenu(!showStampMenu); setShowSignatureMenu(false); }} icon={<Stamp size={17} />} label="Stamp" />
        {stampMenu(false)}
      </div>
    </div>
  );

  const activeShapeTools = ['shape', 'circle', 'line', 'arrow', 'pen'];

  return (
    <>
      <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />

      {/* ── DESKTOP TOOLBAR ── */}
      <div className="hidden md:flex fixed top-0 left-0 right-0 z-50 items-center justify-between h-16 px-4 md:px-6 glass border-b shadow-sm gap-2 overflow-x-auto">
        {/* Logo */}
        <div className="flex items-center gap-3 font-black text-lg tracking-tight shrink-0">
          <div className="w-9 h-9 bg-black dark:bg-white rounded-xl flex items-center justify-center text-white dark:text-black">
            <span className="text-[20px] font-bold leading-none">K</span>
          </div>
          <span className="hidden lg:inline">Karen PDF Pro</span>
        </div>

        {/* Tools */}
        <div className="flex flex-1 items-center justify-center gap-1.5 flex-wrap min-w-0">
          {drawTools}
          {shapeTools}
          {contentTools}
          {activeTool === 'draw' && brushControls}
          {activeTool === 'highlight' && brushControls}
          {activeShapeTools.includes(activeTool) && shapeControls}
          {activeTool === 'text' && textControls}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 shrink-0">
          {zoomControls}
          <div className="flex items-center bg-black/5 dark:bg-white/5 p-1 rounded-2xl">
            <button className="p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl transition-colors" onClick={triggerUndo} title="Undo"><Undo2 size={16} /></button>
            <button className="p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl transition-colors" onClick={triggerRedo} title="Redo"><Redo2 size={16} /></button>
          </div>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors" title="Toggle Theme">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {pngButton(true)}
          {exportButton(false)}
        </div>
      </div>

      {/* ── MOBILE TOP BAR ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-14 px-4 glass border-b shadow-sm">
        <div className="flex items-center gap-2 font-black text-base tracking-tight">
          <div className="w-8 h-8 bg-black dark:bg-white rounded-xl flex items-center justify-center text-white dark:text-black">
            <span className="text-[17px] font-bold leading-none">K</span>
          </div>
          <span className="text-sm">Karen PDF Pro</span>
        </div>
        <div className="flex items-center gap-1.5">
          {zoomControls}
          <div className="flex items-center bg-black/5 dark:bg-white/5 p-0.5 rounded-xl">
            <button className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors" onClick={triggerUndo}><Undo2 size={15} /></button>
            <button className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors" onClick={triggerRedo}><Redo2 size={15} /></button>
          </div>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors">
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          {exportButton(true)}
        </div>
      </div>

      {/* ── MOBILE BOTTOM TOOLBAR ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t shadow-lg">
        <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-hide">
          {drawTools}
          {shapeTools}
          {contentTools}
          {activeTool === 'draw' && brushControls}
          {activeTool === 'highlight' && brushControls}
          {activeShapeTools.includes(activeTool) && shapeControls}
          {activeTool === 'text' && textControls}
          {pngButton(true)}
        </div>
        <div className="h-safe" />
      </div>

      {/* ── Signature modal (both mobile and desktop) ── */}
      {showSignatureMenu && (
        <div className="md:hidden fixed inset-0 z-[55]" onClick={() => setShowSignatureMenu(false)} />
      )}
      {showStampMenu && (
        <div className="fixed inset-0 z-[55]" onClick={() => setShowStampMenu(false)} />
      )}
      {showSignatureModal && <SignatureModal onClose={() => setShowSignatureModal(false)} />}
    </>
  );
}

function ToolButton({
  active, onClick, icon, label,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'p-2.5 rounded-xl transition-all duration-300 ease-out flex items-center justify-center relative group',
        active
          ? 'bg-black text-white dark:bg-white dark:text-black shadow-[0_0_15px_rgba(0,0,0,0.2)] dark:shadow-[0_0_15px_rgba(255,255,255,0.2)] scale-110 z-10'
          : 'hover:bg-black/5 text-muted-foreground hover:text-foreground hover:scale-105',
      )}
    >
      {icon}
      {active && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-current rounded-full" />}
    </button>
  );
}
