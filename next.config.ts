import type { NextConfig } from "next";
import path from "path";

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
