"use client";
import dynamic from "next/dynamic";

const PDFEditor = dynamic(() => import("./components/PDFEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-gray-400">
      <span className="animate-pulse text-lg">Loading editor…</span>
    </div>
  ),
});

export default function Home() {
  return <PDFEditor />;
}
