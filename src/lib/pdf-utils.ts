import * as pdfjs from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';

// Set worker path
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

export async function loadPdf(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  return pdf;
}

export async function renderPageToCanvas(pdf: pdfjs.PDFDocumentProxy, pageNumber: number, canvas: HTMLCanvasElement) {
  const page = await pdf.getPage(pageNumber);

  // Responsive scale: fit within the viewport width with padding, max 1.5x for quality
  const baseViewport = page.getViewport({ scale: 1 });
  const maxWidth = typeof window !== 'undefined'
    ? Math.min(window.innerWidth - 32, 1200)
    : 1200;
  const scale = Math.min(1.5, maxWidth / baseViewport.width);

  const viewport = page.getViewport({ scale });
  const context = canvas.getContext('2d');

  if (!context) return null;

  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({ canvasContext: context, viewport, canvas }).promise;
  return { width: viewport.width, height: viewport.height };
}

export async function exportPdf(originalFile: File, fabricStates: any[]) {
  const originalBytes = await originalFile.arrayBuffer();
  const pdfDoc = await PDFDocument.load(originalBytes);
  const pages = pdfDoc.getPages();

  for (let i = 0; i < fabricStates.length; i++) {
    const fabricData = fabricStates[i];
    if (!fabricData) continue;

    const page = pages[i];
    const { width, height } = page.getSize();

    // Convert Fabric.js canvas to image data
    // We expect fabricData to be a dataURL or similar
    const image = await pdfDoc.embedPng(fabricData);
    
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: width,
      height: height,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}
