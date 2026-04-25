'use client';

import React, { createContext, useContext, useState, useRef } from 'react';
import type * as pdfjs from 'pdfjs-dist';
import { fabric } from 'fabric';

interface EditorContextType {
  file: File | null;
  setFile: (file: File | null) => void;
  pdfDoc: pdfjs.PDFDocumentProxy | null;
  setPdfDoc: (doc: pdfjs.PDFDocumentProxy | null) => void;
  numPages: number;
  setNumPages: (n: number) => void;
  activeTool: 'select' | 'draw' | 'image' | 'eraser' | 'shape';
  setActiveTool: (tool: 'select' | 'draw' | 'image' | 'eraser' | 'shape') => void;
  brushColor: string;
  setBrushColor: (color: string) => void;
  brushWidth: number;
  setBrushWidth: (width: number) => void;
  fabricCanvases: React.MutableRefObject<Map<number, fabric.Canvas>>;
  activePage: number | null;
  setActivePage: (page: number | null) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  signatures: string[];
  setSignatures: (sigs: string[]) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [activeTool, setActiveTool] = useState<'select' | 'draw' | 'image' | 'eraser' | 'shape'>('select');
  const [brushColor, setBrushColor] = useState('#ffffff');
  const [brushWidth, setBrushWidth] = useState(15);
  const fabricCanvases = useRef<Map<number, fabric.Canvas>>(new Map());
  const [activePage, setActivePage] = useState<number | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [signatures, setSignaturesState] = useState<string[]>([]);

  // Load signatures from localStorage
  React.useEffect(() => {
    const savedSigs = localStorage.getItem('karen_pdf_signatures');
    if (savedSigs) {
      try {
        setSignaturesState(JSON.parse(savedSigs));
      } catch (e) {
        console.error('Failed to parse signatures', e);
      }
    }
  }, []);

  const setSignatures = React.useCallback((sigs: string[]) => {
    setSignaturesState(sigs);
    localStorage.setItem('karen_pdf_signatures', JSON.stringify(sigs));
  }, []);

  // Handle theme body class
  React.useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <EditorContext.Provider
      value={{
        file,
        setFile,
        pdfDoc,
        setPdfDoc,
        numPages,
        setNumPages,
        activeTool,
        setActiveTool,
        brushColor,
        setBrushColor,
        brushWidth,
        setBrushWidth,
        fabricCanvases,
        activePage,
        setActivePage,
        theme,
        setTheme,
        signatures,
        setSignatures,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (context === undefined) {
    throw new Error('useEditor must be used within an EditorProvider');
  }
  return context;
}
