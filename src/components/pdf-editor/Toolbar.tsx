'use client';

import React, { useRef, useState } from 'react';
import { fabric } from 'fabric';
import { useEditor } from './EditorContext';
import { 
  MousePointer2, Pencil, Image as ImageIcon, Undo2, Redo2, 
  Download, Plus, Minus, Sun, Moon, Eraser, Check, Loader2, 
  PenTool, Trash2
} from 'lucide-react';
import { SignatureModal } from './SignatureModal';
import { cn } from '@/lib/utils';
import { exportPdf } from '@/lib/pdf-utils';

export function Toolbar() {
  const { 
    activeTool, setActiveTool, brushColor, setBrushColor, brushWidth, setBrushWidth,
    file, fabricCanvases, activePage, theme, setTheme, signatures, setSignatures
  } = useEditor();

  const imageInputRef = useRef<HTMLInputElement>(null);
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'success'>('idle');
  const [showSignatureMenu, setShowSignatureMenu] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);

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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const pageIdx = activePage || 1;
      const canvas = fabricCanvases.current.get(pageIdx);
      if (!canvas) return;
      const reader = new FileReader();
      reader.onload = (f) => {
        const data = f.target?.result as string;
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
      reader.readAsDataURL(file);
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

  const handleExport = async () => {
    if (!file || exportState === 'exporting') return;
    setExportState('exporting');
    const sortedKeys = Array.from(fabricCanvases.current.keys()).sort((a, b) => a - b);
    const states: string[] = [];
    for (const pageIdx of sortedKeys) {
      const canvas = fabricCanvases.current.get(pageIdx);
      if (!canvas) continue;
      // Clear background before export so the PNG is transparent and only
      // contains the annotations — prevents dark fringe artifacts caused by
      // the PDF viewer downsampling a non-transparent or over-scaled image.
      const origBg = canvas.backgroundColor;
      canvas.backgroundColor = '';
      canvas.renderAll();
      // multiplier:1 matches the canvas's natural resolution; multiplier:3 was
      // causing aggressive downscaling in the PDF which created dark border
      // artifacts at the edges of brush strokes.
      states.push(canvas.toDataURL({ format: 'png', multiplier: 1 }));
      canvas.backgroundColor = origBg;
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

  // Signature dropdown menu (opens upward on mobile, downward on desktop)
  const signatureMenu = (upward = false) =>
    showSignatureMenu ? (
      <div
        className={cn(
          'absolute left-0 w-64 bg-white dark:bg-slate-900 border dark:border-white/10 rounded-2xl shadow-2xl p-2 z-[60] flex flex-col gap-2',
          upward ? 'bottom-14' : 'top-14'
        )}
      >
        <div className="text-xs font-bold text-muted-foreground uppercase px-2 pt-1">
          Saved Signatures
        </div>
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
                <span className="text-xs font-bold text-muted-foreground w-5 flex-shrink-0">
                  {idx + 1}.
                </span>
                <div className="flex-1 flex justify-center items-center px-2 mr-6">
                  <img
                    src={sig}
                    alt={`Signature ${idx + 1}`}
                    className="h-10 object-contain mix-blend-multiply dark:mix-blend-normal dark:invert"
                  />
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

  // Shared export button (compact mode for mobile top bar)
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
        exportState === 'success' && 'bg-green-500 text-white dark:bg-green-500 dark:text-white'
      )}
    >
      {exportState === 'exporting' ? (
        <Loader2 size={15} className="animate-spin" />
      ) : exportState === 'success' ? (
        <Check size={15} />
      ) : (
        <Download size={15} />
      )}
      {!compact && (
        <span className="flex-1 text-center">
          {exportState === 'exporting' ? 'Exporting...' : exportState === 'success' ? 'Done' : 'Export'}
        </span>
      )}
    </button>
  );

  // Shared brush controls
  const brushControls = (
    <div className="flex items-center gap-2 px-3 py-1.5 ml-1 bg-black/5 dark:bg-white/5 rounded-2xl flex-shrink-0">
      <input
        type="color"
        value={brushColor}
        onChange={(e) => setBrushColor(e.target.value)}
        className="w-7 h-7 rounded-full border-0 cursor-pointer overflow-hidden p-0 bg-transparent ring-2 ring-primary/20"
      />
      <div className="flex items-center gap-1">
        <button
          onClick={() => setBrushWidth(Math.max(1, brushWidth - 1))}
          className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"
        >
          <Minus size={14} />
        </button>
        <span className="text-xs font-semibold w-5 text-center">{brushWidth}</span>
        <button
          onClick={() => setBrushWidth(Math.min(50, brushWidth + 1))}
          className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );

  return (
    <>
      <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />

      {/* ── DESKTOP TOOLBAR (top bar, hidden on mobile) ── */}
      <div className="hidden md:flex fixed top-0 left-0 right-0 z-50 items-center justify-between h-16 px-4 md:px-6 glass border-b shadow-sm">
        {/* Left – Logo */}
        <div className="flex items-center gap-3 font-black text-lg tracking-tight w-1/4">
          <div className="w-9 h-9 bg-black dark:bg-white rounded-xl flex items-center justify-center text-white dark:text-black">
            <span className="text-[20px] font-bold leading-none">K</span>
          </div>
          Karen PDF Pro
        </div>

        {/* Center – Tools */}
        <div className="flex flex-1 items-center justify-center gap-1">
          <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-2xl">
            <ToolButton active={activeTool === 'select'} onClick={() => setActiveTool('select')} icon={<MousePointer2 size={18} />} label="Select" />
            <ToolButton active={activeTool === 'draw'} onClick={() => setActiveTool('draw')} icon={<Pencil size={18} />} label="Draw" />
            <ToolButton
              active={activeTool === 'image'}
              onClick={() => { setActiveTool('image'); imageInputRef.current?.click(); }}
              icon={<ImageIcon size={18} />}
              label="Image"
            />
            <div className="relative">
              <ToolButton active={showSignatureMenu} onClick={() => setShowSignatureMenu(!showSignatureMenu)} icon={<PenTool size={18} />} label="Signatures" />
              {signatureMenu(false)}
            </div>
            <ToolButton active={activeTool === 'eraser'} onClick={() => setActiveTool('eraser')} icon={<Eraser size={18} />} label="Eraser" />
          </div>

          {activeTool === 'draw' && brushControls}
        </div>

        {/* Right – Actions */}
        <div className="flex items-center justify-end gap-2 w-1/4">
          <div className="flex items-center bg-black/5 dark:bg-white/5 p-1 rounded-2xl">
            <button className="p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl transition-colors" onClick={triggerUndo} title="Undo"><Undo2 size={16} /></button>
            <button className="p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl transition-colors" onClick={triggerRedo} title="Redo"><Redo2 size={16} /></button>
          </div>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors ml-1"
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
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
          <div className="flex items-center bg-black/5 dark:bg-white/5 p-0.5 rounded-xl">
            <button className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors" onClick={triggerUndo} title="Undo"><Undo2 size={15} /></button>
            <button className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors" onClick={triggerRedo} title="Redo"><Redo2 size={15} /></button>
          </div>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          {exportButton(true)}
        </div>
      </div>

      {/* ── MOBILE BOTTOM TOOLBAR ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t shadow-lg">
        <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-hide">
          {/* Tool buttons */}
          <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-2xl flex-shrink-0">
            <ToolButton active={activeTool === 'select'} onClick={() => setActiveTool('select')} icon={<MousePointer2 size={18} />} label="Select" />
            <ToolButton active={activeTool === 'draw'} onClick={() => setActiveTool('draw')} icon={<Pencil size={18} />} label="Draw" />
            <ToolButton
              active={activeTool === 'image'}
              onClick={() => { setActiveTool('image'); imageInputRef.current?.click(); }}
              icon={<ImageIcon size={18} />}
              label="Image"
            />
            <div className="relative">
              <ToolButton active={showSignatureMenu} onClick={() => setShowSignatureMenu(!showSignatureMenu)} icon={<PenTool size={18} />} label="Signatures" />
              {signatureMenu(true)}
            </div>
            <ToolButton active={activeTool === 'eraser'} onClick={() => setActiveTool('eraser')} icon={<Eraser size={18} />} label="Eraser" />
          </div>

          {/* Brush controls (shown when draw is active) */}
          {activeTool === 'draw' && brushControls}
        </div>
        {/* iOS safe area spacer */}
        <div className="h-safe" />
      </div>

      {showSignatureModal && <SignatureModal onClose={() => setShowSignatureModal(false)} />}
    </>
  );
}

function ToolButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'p-2.5 rounded-xl transition-all duration-300 ease-out flex items-center justify-center relative group',
        active
          ? 'bg-black text-white dark:bg-white dark:text-black shadow-[0_0_15px_rgba(0,0,0,0.2)] dark:shadow-[0_0_15px_rgba(255,255,255,0.2)] scale-110 z-10'
          : 'hover:bg-black/5 text-muted-foreground hover:text-foreground hover:scale-105'
      )}
    >
      {icon}
      {active && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-current rounded-full" />
      )}
    </button>
  );
}
