import type { NextConfig } from "next";
import path from "path";
import { copyFileSync, existsSync } from "fs";

// Copy the PDF.js worker from node_modules to public/ at build time so it
// is served from the same origin without any CDN dependency or version mismatch.
const workerSrc = path.join(process.cwd(), "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const workerDest = path.join(process.cwd(), "public/pdf.worker.min.mjs");
try {
  if (existsSync(workerSrc)) copyFileSync(workerSrc, workerDest);
} catch { /* non-fatal — worker already present */ }

const nextConfig: NextConfig = {
  turbopack: {
    // Set root to THIS project directory to avoid Turbopack
    // picking up a lockfile in a parent folder (common Vercel issue)
    root: path.resolve(__dirname),
    // Alias the 'canvas' native module that fabric.js optionally requires.
    // Turbopack's conditional alias: in browser env it uses a no-op stub
    // so the build doesn't fail looking for a native 'canvas' addon.
    resolveAlias: {
      canvas: "./src/lib/canvas-polyfill.ts",
    },
  },
};

export default nextConfig;
