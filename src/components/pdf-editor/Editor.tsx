'use client';

import React, { useCallback } from 'react';
import { useEditor } from './EditorContext';
import { Toolbar } from './Toolbar';
import { PageCanvas } from './PageCanvas';
import { loadPdf } from '@/lib/pdf-utils';
import { Upload, FileText } from 'lucide-react';

export function Editor() {
  const { file, setFile, setPdfDoc, setNumPages, numPages } = useEditor();

  const onFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      const pdf = await loadPdf(selectedFile);
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
    }
  }, [setFile, setPdfDoc, setNumPages]);

  if (!file) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen p-4 relative overflow-hidden"
        style={{
          backgroundImage: 'url(/cat-pattern.png)',
          backgroundSize: '280px',
          backgroundRepeat: 'repeat',
        }}
      >
        {/* Subtle overlay so card stays readable in both light & dark mode */}
        <div className="absolute inset-0 bg-white/60 dark:bg-black/60 backdrop-blur-[2px]" />

        {/* Card */}
        <div className="relative z-10 max-w-md w-full p-8 glass premium-shadow rounded-3xl text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-black dark:bg-white rounded-2xl flex items-center justify-center text-white dark:text-black">
            <FileText size={32} />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight">Karen PDF Pro</h1>
            <p className="text-muted-foreground">Kata Aku Geh!</p>
          </div>
          <label className="relative flex flex-col items-center justify-center p-8 border-2 border-dashed border-muted-foreground/20 rounded-2xl cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-all group">
            <Upload className="w-8 h-8 mb-4 text-muted-foreground group-hover:text-black dark:group-hover:text-white transition-colors" />
            <span className="text-sm font-medium">Click to upload or drag & drop</span>
            <span className="text-xs text-muted-foreground mt-1">PDF files up to 50MB</span>
            <input type="file" className="hidden" accept="application/pdf" onChange={onFileChange} />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-16 pb-28 md:pt-24 md:pb-12">
      <Toolbar />
      <div className="max-w-5xl mx-auto px-2 md:px-4">
        {Array.from({ length: numPages }, (_, i) => (
          <PageCanvas key={i + 1} pageNumber={i + 1} />
        ))}
      </div>
    </div>
  );
}
