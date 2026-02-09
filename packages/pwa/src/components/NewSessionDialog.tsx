import { useState, useEffect } from 'react';
import { X, Folder, ChevronRight, Home, ArrowUp } from 'lucide-react';
import type { ClientMessage } from '@ccremote/shared';
import type { DirectoryListing } from '../hooks/useWebSocket.ts';

interface NewSessionDialogProps {
  onClose: () => void;
  onCreate: (projectPath: string, model: string) => void;
  send: (message: ClientMessage) => void;
  directoryListing: DirectoryListing | null;
}

const MODELS = [
  { id: 'opus', label: 'Opus' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'haiku', label: 'Haiku' },
];

export function NewSessionDialog({ onClose, onCreate, send, directoryListing }: NewSessionDialogProps) {
  const [currentPath, setCurrentPath] = useState('~');
  const [model, setModel] = useState('opus');

  // Request directory listing when path changes
  useEffect(() => {
    send({ type: 'browse_directory', payload: { path: currentPath } });
  }, [currentPath, send]);

  const resolvedPath = directoryListing?.path ?? currentPath;
  const directories = directoryListing?.directories ?? [];

  const navigateTo = (dir: string) => {
    const newPath = resolvedPath.replace(/\/$/, '') + '/' + dir;
    setCurrentPath(newPath);
  };

  const navigateUp = () => {
    const parent = resolvedPath.replace(/\/[^/]+\/?$/, '') || '/';
    setCurrentPath(parent);
  };

  const handleSelect = () => {
    onCreate(resolvedPath, model);
  };

  // Split path into breadcrumb segments
  const pathSegments = resolvedPath.split('/').filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-surface-dark rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-2">
          <h2 className="text-lg font-semibold">Nueva sesión</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200">
            <X size={20} />
          </button>
        </div>

        {/* Breadcrumb path */}
        <div className="px-4 py-2">
          <div className="flex items-center gap-1 text-xs text-slate-400 overflow-x-auto whitespace-nowrap pb-1">
            <button
              onClick={() => setCurrentPath('~')}
              className="flex-shrink-0 p-1 hover:text-slate-200 transition-colors"
            >
              <Home size={14} />
            </button>
            {pathSegments.map((seg, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight size={12} className="text-slate-600 flex-shrink-0" />
                <button
                  onClick={() => setCurrentPath('/' + pathSegments.slice(0, i + 1).join('/'))}
                  className="hover:text-slate-200 transition-colors"
                >
                  {seg}
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Directory list */}
        <div className="flex-1 overflow-y-auto px-4 min-h-[200px] max-h-[40vh]">
          {directoryListing?.error ? (
            <p className="text-sm text-red-400 py-4 text-center">{directoryListing.error}</p>
          ) : (
            <div className="space-y-0.5">
              <button
                onClick={navigateUp}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800/80 text-slate-400 transition-colors"
              >
                <ArrowUp size={16} />
                <span className="text-sm">..</span>
              </button>
              {directories.map((dir) => (
                <button
                  key={dir}
                  onClick={() => navigateTo(dir)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800/80 text-slate-200 transition-colors"
                >
                  <Folder size={16} className="text-indigo-400 flex-shrink-0" />
                  <span className="text-sm truncate">{dir}</span>
                  <ChevronRight size={14} className="text-slate-600 ml-auto flex-shrink-0" />
                </button>
              ))}
              {directories.length === 0 && !directoryListing?.error && (
                <p className="text-sm text-slate-500 py-4 text-center">Sin subdirectorios</p>
              )}
            </div>
          )}
        </div>

        {/* Model selector + Create button */}
        <div className="p-4 space-y-3 border-t border-slate-700/50">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Modelo</label>
            <div className="flex gap-2">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModel(m.id)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    model === m.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700/80 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSelect}
            className="w-full py-3 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition-colors active:scale-[0.98]"
          >
            Crear en {resolvedPath.split('/').pop() || '/'}
          </button>
        </div>
      </div>
    </div>
  );
}
