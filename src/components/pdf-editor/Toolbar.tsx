'use client';

import React, { useRef, useState } from 'react';
import { fabric } from 'fabric';
import { useEditor } from './EditorContext';
import { 
  MousePointer2, 
  Pencil, 
  Image as ImageIcon, 
  Undo2, 
  Redo2, 
  Download,
  Upload,
  Plus,
  Minus,
  Type,
  Sun,
  Moon,
  Eraser,
  Check,
  Loader2,
  PenTool,
  Trash2
} from 'lucide-react';
import { SignatureModal } from './SignatureModal';
import { cn } from '@/lib/utils';
import { exportPdf } from '@/lib/pdf-utils';

export function Toolbar() {
  const { 
    activeTool, 
    setActiveTool, 
    brushColor, 
    setBrushColor, 
    brushWidth, 
    setBrushWidth,
    file,
    fabricCanvases,
    activePage,
    theme,
    setTheme,
    signatures,
    setSignatures
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
    if (canvas && canvas.historyUndo) canvas.historyUndo();
  };

  const triggerRedo = () => {
    const canvas = fabricCanvases.current.get(activePage || 1) as any;
    if (canvas && canvas.historyRedo) canvas.historyRedo();
  };

  const handleExport = async () => {
    if (!file || exportState === 'exporting') return;
    
    setExportState('exporting');
    
    const states: string[] = [];
    const numPages = Array.from(fabricCanvases.current.keys()).length;
    
    // Sort keys to ensure correct page order
    const sortedKeys = Array.from(fabricCanvases.current.keys()).sort((a, b) => a - b);
    
    for (const pageIdx of sortedKeys) {
      const canvas = fabricCanvases.current.get(pageIdx);
      if (canvas) {
        // High resolution export for crisp strokes and to minimize alpha artifacts
        const dataUrl = canvas.toDataURL({
            format: 'png',
            multiplier: 3
        });
        states.push(dataUrl);
      }
    }

    const blob = await exportPdf(file, states);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edited_${file.name}`;
    a.click();
    URL.revokeObjectURL(url);
    
    setExportState('success');
    setTimeout(() => {
      setExportState('idle');
    }, 2000);
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-16 px-4 md:px-6 glass border-b shadow-sm">
      
      {/* Left Menu - Logo */}
      <div className="flex items-center gap-3 font-black text-lg tracking-tight w-1/4">
        <div className="w-9 h-9 bg-black dark:bg-white rounded-xl flex items-center justify-center text-white dark:text-black">
          <span className="text-[20px] font-bold leading-none">K</span>
        </div>
        Karen PDF Pro
      </div>

      {/* Center Menu - Tools */}
      <div className="flex flex-1 items-center justify-center gap-1">
        <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-2xl">
            <ToolButton 
              active={activeTool === 'select'} 
              onClick={() => setActiveTool('select')}
              icon={<MousePointer2 size={18} />}
              label="Select"
            />
            <ToolButton 
              active={activeTool === 'draw'} 
              onClick={() => setActiveTool('draw')}
              icon={<Pencil size={18} />}
              label="Draw"
            />
            <ToolButton 
              active={activeTool === 'image'} 
              onClick={() => {
                setActiveTool('image');
                imageInputRef.current?.click();
              }}
              icon={<ImageIcon size={18} />}
              label="Image"
            />
            <input 
              type="file" 
              ref={imageInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleImageUpload} 
            />

            <div className="relative">
              <ToolButton 
                active={showSignatureMenu} 
                onClick={() => setShowSignatureMenu(!showSignatureMenu)}
                icon={<PenTool size={18} />}
                label="Signatures"
              />
              
              {showSignatureMenu && (
                 <div className="absolute top-14 -left-1/2 w-64 bg-white dark:bg-slate-900 border dark:border-white/10 rounded-2xl shadow-2xl p-2 z-[60] flex flex-col gap-2">
                   <div className="text-xs font-bold text-muted-foreground uppercase px-2 pt-2">Saved Signatures</div>
                   
                   {signatures.length === 0 ? (
                      <div className="text-sm text-center text-muted-foreground p-4">No signatures yet</div>
                   ) : (
                      <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
                        {signatures.map((sig, idx) => (
                           <div key={idx} className="group relative flex flex-row items-center px-3 py-2 bg-slate-50 dark:bg-black/20 rounded-xl border border-transparent hover:border-black/10 dark:hover:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer" onClick={() => insertSignature(sig)}>
                              <span className="text-xs font-bold text-muted-foreground w-5 flex-shrink-0 text-left">{idx + 1}.</span>
                              <div className="flex-1 flex justify-center items-center px-2 mr-6">
                                <img src={sig} alt={`Signature ${idx+1}`} className="h-10 object-contain mix-blend-multiply dark:mix-blend-normal dark:invert" />
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); deleteSignature(idx); }}
                                className="absolute right-2 p-1.5 bg-destructive text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-md hover:bg-destructive/90"
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
              )}
            </div>

            <ToolButton 
              active={activeTool === 'eraser'} 
              onClick={() => setActiveTool('eraser')}
              icon={<Eraser size={18} />}
              label="Eraser"
            />
        </div>

        {(activeTool === 'draw') && (
          <div className="flex items-center gap-3 px-3 py-1.5 ml-2 bg-black/5 dark:bg-white/5 rounded-2xl">
            <input 
              type="color" 
              value={brushColor}
              onChange={(e) => setBrushColor(e.target.value)}
              className="w-6 h-6 rounded-full border-0 cursor-pointer overflow-hidden p-0 bg-transparent ring-2 ring-primary/20"
            />
            <div className="flex items-center gap-1">
              <button 
                  onClick={() => setBrushWidth(Math.max(1, brushWidth - 1))}
                  className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"
                  title="Decrease Size"
              >
                  <Minus size={14} />
              </button>
              <span className="text-xs font-semibold w-5 text-center">{brushWidth}</span>
              <button 
                  onClick={() => setBrushWidth(Math.min(50, brushWidth + 1))}
                  className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"
                  title="Increase Size"
              >
                  <Plus size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Menu - Actions */}
      <div className="flex items-center justify-end gap-2 w-1/4">
        <div className="flex items-center bg-black/5 dark:bg-white/5 p-1 rounded-2xl">
            <button 
                className="p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50"
                onClick={triggerUndo}
                title="Undo"
            >
              <Undo2 size={16} />
            </button>
            <button 
                className="p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50"
                onClick={triggerRedo}
                title="Redo"
            >
              <Redo2 size={16} />
            </button>
        </div>

        <button 
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors ml-1"
          title="Toggle Theme"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <button 
          onClick={handleExport}
          disabled={!file || exportState === 'exporting'}
          className={cn(
            "flex items-center gap-2 px-4 py-2 ml-1 rounded-xl text-sm font-semibold shadow-lg shadow-black/10 transition-all duration-300 ease-out w-[110px] justify-center overflow-hidden",
            (!file || exportState === 'exporting')
              ? "opacity-60 cursor-not-allowed bg-black text-white dark:bg-white dark:text-black" 
              : "bg-black text-white dark:bg-white dark:text-black hover:-translate-y-0.5 hover:shadow-xl active:scale-95 active:translate-y-0",
            exportState === 'success' && "bg-green-500 text-white dark:bg-green-500 dark:text-white"
          )}
        >
          {exportState === 'exporting' ? (
            <Loader2 size={16} className="animate-spin" />
          ) : exportState === 'success' ? (
            <Check size={16} className="animate-in zoom-in spin-in-12" />
          ) : (
            <Download size={16} className="group-hover:-translate-y-1 transition-transform" />
          )}
          <span className="flex-1 text-center">
            {exportState === 'exporting' ? 'Exporting...' : exportState === 'success' ? 'Success' : 'Export'}
          </span>
        </button>
      </div>

      {showSignatureModal && (
        <SignatureModal onClose={() => setShowSignatureModal(false)} />
      )}
    </div>
  );
}

function ToolButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "p-2 rounded-xl transition-all duration-300 ease-out flex items-center justify-center hover:-translate-y-0.5 hover:scale-105 active:scale-95 active:translate-y-0",
        active 
          ? "bg-black text-white dark:bg-white dark:text-black shadow-lg shadow-black/10 scale-105" 
          : "hover:bg-black/5 text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
    </button>
  );
}
