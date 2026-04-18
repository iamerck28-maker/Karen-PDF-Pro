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
    brushColor, 
    brushWidth, 
    fabricCanvases,
    activePage,
    setActivePage
  } = useEditor();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricInstance = useRef<fabric.Canvas | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const { push, undo, redo } = useHistory<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Brush indicator state
  const [mousePos, setMousePos] = useState({ x: -100, y: -100 });
  const [isHovering, setIsHovering] = useState(false);
  const isRestoringHistory = useRef(false);

  // Intersection Observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Initialize Fabric Canvas
  const initFabric = useCallback(() => {
    if (!fabricCanvasRef.current || fabricInstance.current || !dimensions.width) return;

    const canvas = new fabric.Canvas(fabricCanvasRef.current, {
      width: dimensions.width,
      height: dimensions.height,
      selection: activeTool === 'select',
      isDrawingMode: activeTool === 'draw'
    });

    // Event listeners for history
    const saveState = () => {
        if (isRestoringHistory.current) return;
        push(JSON.stringify(canvas.toJSON()));
    };

    canvas.on('path:created', saveState);
    canvas.on('object:added', saveState);
    canvas.on('object:modified', saveState);
    canvas.on('object:removed', saveState);

    fabricInstance.current = canvas;
    fabricCanvases.current.set(pageNumber, canvas);

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
    
    // Initial state
    saveState();
  }, [dimensions, activeTool, pageNumber, push, undo, redo, fabricCanvases]);



  // Load PDF Page
  useEffect(() => {
    if (isVisible && pdfDoc && pdfCanvasRef.current) {
      renderPageToCanvas(pdfDoc, pageNumber, pdfCanvasRef.current).then((dims) => {
        if (dims) {
          setDimensions(dims);
        }
      });
    }
  }, [isVisible, pdfDoc, pageNumber]);

  // Sync tools
  useEffect(() => {
    if (fabricInstance.current) {
      fabricInstance.current.isDrawingMode = activeTool === 'draw';
      fabricInstance.current.selection = activeTool === 'select';
      
      if (fabricInstance.current.freeDrawingBrush) {
        fabricInstance.current.freeDrawingBrush.color = brushColor;
        fabricInstance.current.freeDrawingBrush.width = brushWidth;
      }

      let cursor = 'default';
      let hoverCursor = 'move';

      if (activeTool === 'draw') {
        cursor = 'none'; // we will use our custom overlay
        hoverCursor = 'none';
      } else if (activeTool === 'eraser') {
        cursor = 'none'; // Custom overlay for eraser too
        hoverCursor = 'none';
      }

      fabricInstance.current.defaultCursor = cursor;
      fabricInstance.current.hoverCursor = hoverCursor;
      fabricInstance.current.renderAll();
    }
  }, [activeTool, brushColor, brushWidth]);

  useEffect(() => {
      if (dimensions.width && !fabricInstance.current) {
          initFabric();
      }
  }, [dimensions, initFabric]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && fabricInstance.current) {
        const reader = new FileReader();
        reader.onload = (f) => {
            const data = f.target?.result as string;
            fabric.Image.fromURL(data, (img) => {
                img.scaleToWidth(200);
                // Apply multiply blend mode
                (img as any).set({
                    globalCompositeOperation: 'multiply'
                });
                fabricInstance.current?.add(img);
                fabricInstance.current?.centerObject(img);
                fabricInstance.current?.setActiveObject(img);
                fabricInstance.current?.renderAll();
                
                // Reset file input
                if (fileInputRef.current) fileInputRef.current.value = '';
            });
        };
        reader.readAsDataURL(file);
    }
  };

  // Handle click events properly inside Fabric Canvas
  useEffect(() => {
    if (!fabricInstance.current) return;
    
    const handleMouseDown = (options: fabric.IEvent | any) => {
        setActivePage(pageNumber); // Set active page on click
        
        if (activeTool === 'eraser' && options.target) {
            // Remove the clicked object
            fabricInstance.current!.remove(options.target);
            // Manually save state since object:removed might fire but we can force it
            if (!isRestoringHistory.current) {
                push(JSON.stringify(fabricInstance.current!.toJSON()));
            }
        } else if (activeTool === 'image' && !options.target) {
            if (fileInputRef.current) fileInputRef.current.click();
        }
    };

    fabricInstance.current.on('mouse:down', handleMouseDown);
    
    return () => {
        fabricInstance.current?.off('mouse:down', handleMouseDown);
    };
  }, [activeTool, brushColor, brushWidth, pageNumber, setActivePage]);

  return (
    <div 
        ref={containerRef} 
        className={`relative mb-8 mx-auto canvas-container bg-white overflow-hidden transition-all duration-300 ${activePage === pageNumber ? 'ring-2 ring-primary ring-offset-2 dark:ring-offset-slate-900' : 'opacity-90 hover:opacity-100'} ${(activeTool === 'draw' || activeTool === 'eraser') ? 'cursor-none' : ''}`}
        style={{
          width: dimensions.width || '100%',
          height: dimensions.height || '800px',
          maxWidth: '100%',
          // Prevent page scroll from interfering with drawing on touch devices
          touchAction: (activeTool === 'draw' || activeTool === 'eraser') ? 'none' : 'auto',
        }}
        onMouseEnter={() => {
            setActivePage(pageNumber);
            setIsHovering(true);
        }}
        onMouseLeave={() => setIsHovering(false)}
        onMouseMove={(e) => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
                setMousePos({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                });
            }
        }}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handleImageUpload} 
      />
      
      {/* Brush Indicator */}
      {isHovering && activeTool === 'draw' && (
        <div 
          className="absolute z-50 rounded-full border border-black/30 dark:border-white/50 pointer-events-none transition-transform duration-75"
          style={{
            width: `${brushWidth}px`,
            height: `${brushWidth}px`,
            backgroundColor: 'rgba(128, 128, 128, 0.4)',
            left: `${mousePos.x}px`,
            top: `${mousePos.y}px`,
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}

      {/* Eraser Cursor Overlay */}
      {isHovering && activeTool === 'eraser' && (
        <div 
          className="absolute z-50 pointer-events-none transition-transform duration-75 flex items-center justify-center"
          style={{
            left: `${mousePos.x}px`,
            top: `${mousePos.y}px`,
            transform: 'translate(-50%, -80%)', // Shifted slightly so icon tip points at cursor
          }}
        >
           <div className="bg-destructive text-white p-1 rounded-md shadow-sm opacity-90 animate-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
           </div>
        </div>
      )}

      {isVisible ? (
        <>
          <canvas ref={pdfCanvasRef} className="absolute inset-0 z-0" />
          <div className="absolute inset-0 z-10">
            <canvas ref={fabricCanvasRef} />
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground animate-pulse">
          Loading Page {pageNumber}...
        </div>
      )}
      
      <div className="absolute top-2 left-2 px-2 py-1 glass text-[10px] font-bold rounded-md z-20 pointer-events-none">
        PAGE {pageNumber}
      </div>
    </div>
  );
}
