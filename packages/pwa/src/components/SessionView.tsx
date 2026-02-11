import { useState, useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { SessionInfo } from '@ccremote/shared';
import { TerminalOutput } from './TerminalOutput.tsx';
import { MobileKeyToolbar } from './MobileKeyToolbar.tsx';
import { MobileInput } from './MobileInput.tsx';

interface SessionViewProps {
  session: SessionInfo;
  screen: string;
  onBack: () => void;
  onResize?: (cols: number, rows: number) => void;
  onInput?: (data: string) => void;
}

export function SessionView({
  session,
  screen,
  onBack,
  onResize,
  onInput,
}: SessionViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Handle virtual keyboard resize — set root height to visualViewport
  // so flex layout distributes space correctly above the keyboard
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

  const handleKey = (data: string) => {
    onInput?.(data);
  };

  const handleMobileInput = (data: string) => {
    onInput?.(data);
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
        <TerminalOutput
          sessionId={session.id}
          screen={screen}
          onResize={onResize}
          onInput={onInput}
          disableInput={isMobile}
        />
      </div>
      {/* Only show on small screens (mobile/tablet) */}
      <div className="md:hidden">
        <MobileInput onSend={handleMobileInput} />
        <MobileKeyToolbar onKey={handleKey} />
      </div>
    </div>
  );
}
