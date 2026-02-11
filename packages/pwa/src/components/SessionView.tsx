import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, X, Copy, Check } from 'lucide-react';
import type { SessionInfo } from '@ccremote/shared';
import { TerminalOutput } from './TerminalOutput.tsx';
import { MobileKeyToolbar } from './MobileKeyToolbar.tsx';
import { MobileInput } from './MobileInput.tsx';

interface SessionViewProps {
  session: SessionInfo;
  screen: string;
  scrollback?: string;
  onBack: () => void;
  onResize?: (cols: number, rows: number) => void;
  onInput?: (data: string) => void;
  onRequestScrollback?: () => void;
}

export function SessionView({
  session,
  screen,
  scrollback,
  onBack,
  onResize,
  onInput,
  onRequestScrollback,
}: SessionViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLPreElement>(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const [showScrollback, setShowScrollback] = useState(false);
  const [copied, setCopied] = useState(false);

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
      // Scroll to bottom of the scrollback content
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
    // Strip ANSI escape sequences for clean text
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

  return (
    <div ref={rootRef} className="h-full w-full flex flex-col overflow-hidden">
      <div className="flex-1 relative min-h-0">
        <button
          onClick={onBack}
          className="absolute top-2 left-2 z-10 p-2 bg-slate-800/60 hover:bg-slate-700/80 rounded-lg transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <button
          onClick={handleCopyScreen}
          className="absolute top-2 right-2 z-10 p-2 bg-slate-800/60 hover:bg-slate-700/80 rounded-lg transition-colors"
        >
          {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
        </button>
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
      </div>
      {/* Only show on small screens (mobile/tablet) */}
      <div className="md:hidden">
        <MobileInput onSend={handleMobileInput} />
        <MobileKeyToolbar onKey={handleKey} onScroll={handleScrollRequest} />
      </div>
    </div>
  );
}
