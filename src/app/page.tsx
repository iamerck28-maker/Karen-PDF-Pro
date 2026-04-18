'use client';

import dynamic from 'next/dynamic';

const PDFEditorApp = dynamic(
  () => import('@/components/pdf-editor/App'),
  { ssr: false }
);

export default function Home() {
  return (
    <main className="min-h-screen">
      <PDFEditorApp />
    </main>
  );
}
