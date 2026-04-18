'use client';

import { EditorProvider } from './EditorContext';
import { Editor } from './Editor';

export default function PDFEditorApp() {
  return (
    <EditorProvider>
      <Editor />
    </EditorProvider>
  );
}
