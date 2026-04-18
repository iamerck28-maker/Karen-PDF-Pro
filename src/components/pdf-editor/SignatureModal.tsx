'use client';

import React, { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';
import { X, Trash2, Check, Upload as UploadIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditor } from './EditorContext';

interface SignatureModalProps {
  onClose: () => void;
}

export function SignatureModal({ onClose }: SignatureModalProps) {
  const { signatures, setSignatures } = useEditor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      isDrawingMode: true,
      width: 400,
      height: 200,
      backgroundColor: 'transparent'
    });

    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = '#000000';
      canvas.freeDrawingBrush.width = 3;
    }

    fabricRef.current = canvas;

    return () => {
      canvas.dispose();
    };
  }, []);

  const handleClear = () => {
    if (fabricRef.current) {
      fabricRef.current.clear();
      fabricRef.current.backgroundColor = 'transparent';
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && fabricRef.current) {
      const reader = new FileReader();
      reader.onload = (f) => {
        const data = f.target?.result as string;
        fabric.Image.fromURL(data, (img) => {
          fabricRef.current!.clear();
          fabricRef.current!.backgroundColor = 'transparent';
          
          if (img.width! > 380 || img.height! > 180) {
            img.scaleToWidth(Math.min(380, img.width!));
            if (img.getScaledHeight() > 180) {
              img.scaleToHeight(180);
            }
          }
          
          fabricRef.current!.add(img);
          fabricRef.current!.centerObject(img);
          fabricRef.current!.renderAll();
          
          if (fileInputRef.current) fileInputRef.current.value = '';
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    if (!fabricRef.current) return;
    
    // Check if canvas is actually empty
    if (fabricRef.current.getObjects().length === 0) {
      alert('Please draw a signature first.');
      return;
    }

    // Export as transparent PNG
    const dataUrl = fabricRef.current.toDataURL({
      format: 'png',
      multiplier: 2
    });

    setSignatures([...signatures, dataUrl]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 h-[100dvh] w-[100dvw]">
      <div className="m-auto bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/png, image/jpeg" 
          onChange={handleFileUpload} 
        />
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b dark:border-white/10">
          <h2 className="text-xl font-bold">New Signature</h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Canvas Area */}
        <div className="p-6 bg-slate-50 dark:bg-black/20 flex justify-center items-center">
          <div className="bg-white rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 overflow-hidden cursor-crosshair">
            <canvas ref={canvasRef} />
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between p-6 border-t dark:border-white/10 bg-slate-50/50 dark:bg-black/10">
          <div className="flex gap-2">
            <button 
              onClick={handleClear}
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
            >
              <Trash2 size={16} />
              <span className="hidden sm:inline">Clear</span>
            </button>
            <button 
              onClick={handleUploadClick}
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors"
            >
              <UploadIcon size={16} />
              Upload 
            </button>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-black text-white dark:bg-white dark:text-black rounded-xl shadow-lg hover:opacity-90 transition-all active:scale-95"
            >
              <Check size={16} />
              Save Signature
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
