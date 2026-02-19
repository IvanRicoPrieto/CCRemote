import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { ArrowLeft, X, Copy, Check, Terminal, FolderTree } from 'lucide-react';
import type { SessionInfo, ClientMessage, FileListingMessage, FileContentMessage, FileWriteResultMessage, FileDeleteResultMessage, FileCreateResultMessage, FileRenameResultMessage } from '@ccremote/shared';
import { TerminalOutput } from './TerminalOutput.tsx';
import { MobileKeyToolbar } from './MobileKeyToolbar.tsx';
import { MobileInput } from './MobileInput.tsx';
import { FileExplorer } from './FileExplorer.tsx';
import { useFileExplorer } from '../hooks/useFileExplorer.ts';

const CodeEditor = lazy(() => import('./CodeEditor.tsx').then(m => ({ default: m.CodeEditor })));

interface SessionViewProps {
  session: SessionInfo;
  screen: string;
  scrollback?: string;
  onBack: () => void;
  onResize?: (cols: number, rows: number) => void;
  onInput?: (data: string) => void;
  onRequestScrollback?: () => void;
  send: (message: ClientMessage) => void;
  authToken: string;
  fileListing: FileListingMessage['payload'] | null;
  fileContent: FileContentMessage['payload'] | null;
  fileWriteResult: FileWriteResultMessage['payload'] | null;
  fileDeleteResult: FileDeleteResultMessage['payload'] | null;
  fileCreateResult: FileCreateResultMessage['payload'] | null;
  fileRenameResult: FileRenameResultMessage['payload'] | null;
}

export function SessionView({
  session,
  screen,
  scrollback,
  onBack,
  onResize,
  onInput,
  onRequestScrollback,
  send,
  authToken,
  fileListing,
  fileContent,
  fileWriteResult,
  fileDeleteResult,
  fileCreateResult,
  fileRenameResult,
}: SessionViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLPreElement>(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const [showScrollback, setShowScrollback] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState<'terminal' | 'explorer'>('terminal');

  const explorer = useFileExplorer({
    sessionId: session.id,
    projectPath: session.projectPath,
    send,
  });

  // Connect WebSocket file responses to explorer hook
  useEffect(() => {
    if (fileListing && !fileListing.error) {
      explorer.handleFileListing(fileListing.path, fileListing.entries);
    }
  }, [fileListing, explorer.handleFileListing]);

  useEffect(() => {
    if (fileContent) {
      explorer.handleFileContent(fileContent.path, fileContent.content, fileContent.error);
    }
  }, [fileContent, explorer.handleFileContent]);

  useEffect(() => {
    if (fileWriteResult) {
      explorer.handleFileWriteResult(fileWriteResult.path, fileWriteResult.success, fileWriteResult.error);
    }
  }, [fileWriteResult, explorer.handleFileWriteResult]);

  useEffect(() => {
    if (fileDeleteResult) {
      explorer.handleFileDeleteResult(fileDeleteResult.path, fileDeleteResult.success);
    }
  }, [fileDeleteResult, explorer.handleFileDeleteResult]);

  useEffect(() => {
    if (fileCreateResult) {
      explorer.handleFileCreateResult(fileCreateResult.path, fileCreateResult.success, fileCreateResult.isDirectory, fileCreateResult.error);
    }
  }, [fileCreateResult, explorer.handleFileCreateResult]);

  useEffect(() => {
    if (fileRenameResult) {
      explorer.handleFileRenameResult(fileRenameResult.oldPath, fileRenameResult.newPath, fileRenameResult.success, fileRenameResult.error);
    }
  }, [fileRenameResult, explorer.handleFileRenameResult]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Handle virtual keyboard resize
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const handleResize = () => {
      if (rootRef.current) {
        rootRef.current.style.height = `${vv.height}px`;
      }
    };
    handleResize();
    vv.addEventListener('resize', handleResize);
    return () => vv.removeEventListener('resize', handleResize);
  }, []);

  // Show overlay when scrollback content arrives
  useEffect(() => {
    if (scrollback && showScrollback && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [scrollback, showScrollback]);

  const handleKey = (data: string) => {
    onInput?.(data);
  };

  const handleMobileInput = (data: string) => {
    onInput?.(data);
  };

  const handleScrollRequest = () => {
    setShowScrollback(true);
    onRequestScrollback?.();
  };

  const handleCloseScrollback = () => {
    setShowScrollback(false);
  };

  const handleCopyScreen = async () => {
    const clean = screen
      .replace(/\x1b(?:\[[0-9;?]*[a-zA-Z]|\([A-Z])/g, '')
      .split('\n')
      .map(l => l.trimEnd())
      .join('\n')
      .trim();
    try {
      await navigator.clipboard.writeText(clean);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard may not be available */ }
  };

  const handleDownloadFile = useCallback((filePath: string) => {
    const params = new URLSearchParams({
      token: authToken,
      sessionId: session.id,
      path: filePath,
    });
    const url = `${window.location.origin}/download?${params.toString()}`;
    window.open(url, '_blank');
  }, [authToken, session.id]);

  return (
    <div ref={rootRef} className="h-full w-full flex flex-col overflow-hidden">
      <div className="flex-1 relative min-h-0">
        {/* Top bar with back + toggle */}
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
          <button
            onClick={onBack}
            className="p-2 bg-slate-800/60 hover:bg-slate-700/80 rounded-lg transition-colors"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="flex bg-slate-800/60 rounded-lg overflow-hidden">
            <button
              onClick={() => setActiveView('terminal')}
              className={`p-2 transition-colors ${
                activeView === 'terminal'
                  ? 'bg-indigo-600/80 text-white'
                  : 'text-slate-400 hover:bg-slate-700/80'
              }`}
            >
              <Terminal size={18} />
            </button>
            <button
              onClick={() => setActiveView('explorer')}
              className={`p-2 transition-colors ${
                activeView === 'explorer'
                  ? 'bg-indigo-600/80 text-white'
                  : 'text-slate-400 hover:bg-slate-700/80'
              }`}
            >
              <FolderTree size={18} />
            </button>
          </div>
        </div>

        {/* Copy button (terminal only) */}
        {activeView === 'terminal' && (
          <button
            onClick={handleCopyScreen}
            className="absolute top-2 right-2 z-10 p-2 bg-slate-800/60 hover:bg-slate-700/80 rounded-lg transition-colors"
          >
            {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
          </button>
        )}

        {/* Conditional view */}
        {activeView === 'terminal' ? (
          <>
            <TerminalOutput
              sessionId={session.id}
              screen={screen}
              onResize={onResize}
              onInput={onInput}
              onRequestScrollback={handleScrollRequest}
              disableInput={isMobile}
            />

            {/* Scrollback overlay */}
            {showScrollback && (
              <div className="absolute inset-0 z-20 flex flex-col bg-[#0f172a]">
                <div className="flex items-center justify-between px-3 py-2 bg-slate-800/90 border-b border-slate-700/50">
                  <span className="text-slate-300 text-sm font-medium">Historial</span>
                  <button
                    onClick={handleCloseScrollback}
                    className="p-1.5 bg-slate-700/80 hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
                <pre
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto overflow-x-hidden p-3 text-[13px] leading-[1.2] text-slate-200 font-mono whitespace-pre-wrap break-all"
                >
                  {scrollback ?? 'Cargando...'}
                </pre>
              </div>
            )}
          </>
        ) : explorer.openFilePath ? (
          <div className="absolute inset-0 pt-14">
            <Suspense fallback={<div className="h-full flex items-center justify-center bg-surface-dark"><span className="text-slate-400 text-sm">Cargando editor...</span></div>}>
              <CodeEditor
                filePath={explorer.openFilePath}
                content={explorer.openFileContent ?? ''}
                error={explorer.openFileError}
                isLoading={explorer.isLoadingFile}
                onSave={explorer.saveFile}
                onClose={explorer.closeFile}
              />
            </Suspense>
          </div>
        ) : (
          <div className="absolute inset-0 pt-14">
            <FileExplorer
              projectPath={session.projectPath}
              projectName={session.projectName}
              tree={explorer.tree}
              expandedPaths={explorer.expandedPaths}
              onToggleDirectory={explorer.toggleDirectory}
              onOpenFile={explorer.openFile}
              onDeleteFile={explorer.deleteFile}
              onCreateFile={explorer.createFile}
              onCreateDirectory={explorer.createDirectory}
              onRenameFile={explorer.renameFile}
              onDownloadFile={handleDownloadFile}
              onRequestListing={explorer.requestListing}
            />
          </div>
        )}
      </div>

      {/* Mobile input: only in terminal view */}
      {activeView === 'terminal' && (
        <div className="md:hidden">
          <MobileInput onSend={handleMobileInput} />
          <MobileKeyToolbar onKey={handleKey} onScroll={handleScrollRequest} />
        </div>
      )}
    </div>
  );
}
