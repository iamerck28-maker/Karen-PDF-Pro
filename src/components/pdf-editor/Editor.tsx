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
      try {
        setFile(selectedFile);
        const pdf = await loadPdf(selectedFile);
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
      } catch (error) {
        console.error('Error loading PDF:', error);
        alert('Gagal memuat PDF. Pastikan file tidak rusak.');
      }
    }
  }, [setFile, setPdfDoc, setNumPages]);

  if (!file) {
    return (
      <div
        className="flex flex-col items-center justify-start pt-12 md:justify-center md:pt-4 min-h-screen p-4 relative overflow-hidden bg-cover bg-no-repeat bg-[left_bottom] md:bg-bottom"
        style={{
          backgroundImage: 'url(/cat-pattern.png)',
        }}
      >
        {/* Subtle overlay so card stays readable in both light & dark mode */}
        <div className="absolute inset-0 bg-white/60 dark:bg-black/60 backdrop-blur-[2px]" />

        {/* Card */}
        <div className="relative z-10 max-w-sm md:max-w-md w-full p-6 md:p-8 glass premium-shadow rounded-3xl text-center space-y-4 md:space-y-6 animate-in fade-in zoom-in duration-500 hover:translate-y-[-4px] transition-transform duration-300">
          <div className="mx-auto w-12 h-12 md:w-16 md:h-16 bg-black dark:bg-white rounded-2xl flex items-center justify-center text-white dark:text-black shadow-xl shadow-black/10 animate-bounce-slow">
            <FileText className="w-6 h-6 md:w-8 md:h-8" />
          </div>
          <div className="space-y-1 md:space-y-2">
            <h1 className="text-2xl md:text-4xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-black to-black/60 dark:from-white dark:to-white/60">
              Karen PDF Pro
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground font-medium italic opacity-80">"Kata Aku Geh!"</p>
          </div>
          <label className="relative flex flex-col items-center justify-center p-6 md:p-8 border-2 border-dashed border-primary/20 hover:border-primary/50 rounded-2xl cursor-pointer hover:bg-primary/5 transition-all group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <Upload className="w-6 h-6 md:w-8 md:h-8 mb-3 md:mb-4 text-muted-foreground group-hover:text-primary transition-colors relative z-10" />
            <span className="text-xs md:text-sm font-bold relative z-10">Click to upload or drag & drop</span>
            <span className="text-[10px] md:text-xs text-muted-foreground mt-1 relative z-10 font-medium">PDF files up to 50MB</span>
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
