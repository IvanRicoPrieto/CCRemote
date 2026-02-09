import { ArrowLeft } from 'lucide-react';
import type { SessionInfo } from '@ccremote/shared';
import { TerminalOutput } from './TerminalOutput.tsx';
import { MobileKeyToolbar } from './MobileKeyToolbar.tsx';

interface SessionViewProps {
  session: SessionInfo;
  screen: string;
  onBack: () => void;
  onResize?: (cols: number, rows: number) => void;
  onInput?: (data: string) => void;
}

export function SessionView({
  screen,
  onBack,
  onResize,
  onInput,
}: SessionViewProps) {
  const handleKey = (data: string) => {
    onInput?.(data);
  };

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex-1 relative min-h-0">
        <button
          onClick={onBack}
          className="absolute top-2 left-2 z-10 p-2 bg-slate-800/60 hover:bg-slate-700/80 rounded-lg transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <TerminalOutput screen={screen} onResize={onResize} onInput={onInput} />
      </div>
      {/* Only show on small screens (mobile/tablet) */}
      <div className="md:hidden">
        <MobileKeyToolbar onKey={handleKey} />
      </div>
    </div>
  );
}
