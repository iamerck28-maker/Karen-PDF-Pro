import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// Worker is copied from node_modules to public/ by next.config.ts at build time,
// ensuring the version always matches the installed pdfjs-dist package.
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
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

// Renders a single PDF page and draws the Fabric annotation layer on top into
// one fully-opaque canvas, then returns it as a PNG data URL.
// Because everything is composited on the canvas (not in the PDF), there are no
// alpha-channel artifacts or anti-aliasing halos in the exported result.
export async function createCombinedPagePng(
  pdfJsDoc: pdfjs.PDFDocumentProxy,
  pageNum: number,
  fabricLowerEl: HTMLCanvasElement
): Promise<string> {
  const page = await pdfJsDoc.getPage(pageNum);
  const baseViewport = page.getViewport({ scale: 1 });
  const maxWidth = typeof window !== 'undefined'
    ? Math.min(window.innerWidth - 32, 1200)
    : 1200;
  const scale = Math.min(1.5, maxWidth / baseViewport.width);
  const viewport = page.getViewport({ scale });

  const combined = document.createElement('canvas');
  combined.width = viewport.width;
  combined.height = viewport.height;
  const ctx = combined.getContext('2d')!;

  // 1. Render the original PDF page (opaque background)
  await page.render({ canvasContext: ctx, viewport, canvas: combined }).promise;

  // 2. Composite Fabric annotations on top.
  //    Fabric's lowerCanvasEl is scaled by devicePixelRatio (retina scaling),
  //    so its pixel dimensions are larger than the viewport. We explicitly
  //    draw it scaled down to viewport size so annotations align with the PDF.
  ctx.drawImage(fabricLowerEl, 0, 0, viewport.width, viewport.height);

  return combined.toDataURL('image/png');
}

// fabricStates is indexed 0…numPages-1; null means the page has no annotations.
export async function exportPdf(originalFile: File, fabricStates: (string | null)[]) {
  const originalBytes = await originalFile.arrayBuffer();
  const pdfDoc = await PDFDocument.load(originalBytes);
  const pages = pdfDoc.getPages();

  for (let i = 0; i < fabricStates.length; i++) {
    const dataUrl = fabricStates[i];
    if (!dataUrl || i >= pages.length) continue;

    const page = pages[i];
    const { width, height } = page.getSize();

    const image = await pdfDoc.embedPng(dataUrl);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}
