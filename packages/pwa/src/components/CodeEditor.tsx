import { useState, useMemo, useCallback, useEffect } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { yaml } from '@codemirror/lang-yaml';
import { rust } from '@codemirror/lang-rust';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { sql } from '@codemirror/lang-sql';
import { go } from '@codemirror/lang-go';
import { php } from '@codemirror/lang-php';
import { xml } from '@codemirror/lang-xml';
import { getLanguageFromFilename } from '../lib/fileUtils.ts';

interface CodeEditorProps {
  filePath: string;
  content: string;
  error?: string | null;
  isLoading: boolean;
  onSave: (path: string, content: string) => void;
  onClose: () => void;
}

const languageExtensions: Record<string, () => ReturnType<typeof javascript>> = {
  typescript: () => javascript({ typescript: true, jsx: true }),
  javascript: () => javascript({ jsx: true }),
  html: () => html() as ReturnType<typeof javascript>,
  css: () => css() as ReturnType<typeof javascript>,
  json: () => json() as ReturnType<typeof javascript>,
  markdown: () => markdown() as ReturnType<typeof javascript>,
  python: () => python() as ReturnType<typeof javascript>,
  yaml: () => yaml() as ReturnType<typeof javascript>,
  rust: () => rust() as ReturnType<typeof javascript>,
  cpp: () => cpp() as ReturnType<typeof javascript>,
  java: () => java() as ReturnType<typeof javascript>,
  sql: () => sql() as ReturnType<typeof javascript>,
  go: () => go() as ReturnType<typeof javascript>,
  php: () => php() as ReturnType<typeof javascript>,
  xml: () => xml() as ReturnType<typeof javascript>,
};

export function CodeEditor({
  filePath, content, error, isLoading, onSave, onClose,
}: CodeEditorProps) {
  const [editedContent, setEditedContent] = useState(content);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  const fileName = filePath.split('/').pop() ?? '';
  const hasChanges = editedContent !== content;

  // Sync when content arrives from server
  useEffect(() => {
    setEditedContent(content);
  }, [content]);

  const langExtension = useMemo(() => {
    const lang = getLanguageFromFilename(fileName);
    const factory = languageExtensions[lang];
    return factory ? [factory()] : [];
  }, [fileName]);

  const handleSave = useCallback(() => {
    onSave(filePath, editedContent);
  }, [filePath, editedContent, onSave]);

  const handleClose = useCallback(() => {
    if (hasChanges) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  }, [hasChanges, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    setShowUnsavedDialog(false);
    onClose();
  }, [onClose]);

  const handleSaveAndClose = useCallback(() => {
    onSave(filePath, editedContent);
    setShowUnsavedDialog(false);
    onClose();
  }, [filePath, editedContent, onSave, onClose]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-dark">
        <span className="text-slate-400 text-sm">Cargando archivo...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col bg-surface-dark">
        <div className="flex items-center gap-3 px-3 py-2 bg-slate-800/90 border-b border-slate-700/50">
          <button onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors">
            <ArrowLeft size={18} />
          </button>
          <span className="text-sm text-slate-200 truncate">{fileName}</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface-dark">
      <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-800/90 border-b border-slate-700/50">
        <button
          onClick={handleClose}
          className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
        >
          <ArrowLeft size={18} />
        </button>

        <span className="text-sm text-slate-200 truncate flex-1">
          {fileName}
          {hasChanges && <span className="text-indigo-400 ml-1">*</span>}
        </span>

        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
            hasChanges
              ? 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-[0.98]'
              : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
          }`}
        >
          <Save size={14} />
          Guardar
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <CodeMirror
          value={editedContent}
          onChange={(val) => setEditedContent(val)}
          extensions={langExtension}
          theme={oneDark}
          height="100%"
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: false,
            indentOnInput: true,
          }}
        />
      </div>

      {/* Unsaved changes dialog */}
      {showUnsavedDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 max-w-sm w-full shadow-2xl">
            <h3 className="text-slate-100 font-medium mb-2">Cambios sin guardar</h3>
            <p className="text-slate-300 text-sm mb-5">
              ¿Qué quieres hacer con los cambios en <span className="font-mono text-indigo-400">{fileName}</span>?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowUnsavedDialog(false)}
                className="px-3 py-2 rounded-lg text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDiscardAndClose}
                className="px-3 py-2 rounded-lg text-sm text-white bg-red-600 hover:bg-red-500 transition-colors"
              >
                Descartar
              </button>
              <button
                onClick={handleSaveAndClose}
                className="px-3 py-2 rounded-lg text-sm text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
