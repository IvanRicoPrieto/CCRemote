import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, CornerDownLeft, X, ChevronsUp, ChevronsDown } from 'lucide-react';

interface MobileKeyToolbarProps {
  onKey: (data: string) => void;
}

const KEY_ESCAPE = '\x1b';
const KEY_ARROW_UP = '\x1b[A';
const KEY_ARROW_DOWN = '\x1b[B';
const KEY_ARROW_RIGHT = '\x1b[C';
const KEY_ARROW_LEFT = '\x1b[D';
const KEY_ENTER = '\r';
const KEY_TAB = '\t';
const KEY_CTRL_C = '\x03';
const KEY_PAGE_UP = '\x1b[5~';
const KEY_PAGE_DOWN = '\x1b[6~';

export function MobileKeyToolbar({ onKey }: MobileKeyToolbarProps) {
  const btn =
    'flex items-center justify-center h-10 min-w-[40px] px-2 rounded-lg bg-slate-700/80 active:bg-slate-600 text-slate-200 text-sm font-medium select-none touch-manipulation';

  const handlePointerDown = (e: React.PointerEvent, data: string) => {
    e.preventDefault();
    (document.activeElement as HTMLElement)?.blur();
    onKey(data);
  };

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-900/95 border-t border-slate-700/50 overflow-x-auto">
      <button className={btn} tabIndex={-1} onPointerDown={(e) => handlePointerDown(e, KEY_ESCAPE)}>
        Esc
      </button>
      <button className={btn} tabIndex={-1} onPointerDown={(e) => handlePointerDown(e, KEY_TAB)}>
        Tab
      </button>

      <div className="w-px h-6 bg-slate-600/50 mx-0.5" />

      <button className={btn} tabIndex={-1} onPointerDown={(e) => handlePointerDown(e, KEY_ARROW_UP)}>
        <ArrowUp size={18} />
      </button>
      <button className={btn} tabIndex={-1} onPointerDown={(e) => handlePointerDown(e, KEY_ARROW_DOWN)}>
        <ArrowDown size={18} />
      </button>
      <button className={btn} tabIndex={-1} onPointerDown={(e) => handlePointerDown(e, KEY_ARROW_LEFT)}>
        <ArrowLeft size={18} />
      </button>
      <button className={btn} tabIndex={-1} onPointerDown={(e) => handlePointerDown(e, KEY_ARROW_RIGHT)}>
        <ArrowRight size={18} />
      </button>

      <div className="w-px h-6 bg-slate-600/50 mx-0.5" />

      <button className={btn} tabIndex={-1} onPointerDown={(e) => handlePointerDown(e, KEY_PAGE_UP)}>
        <ChevronsUp size={18} />
      </button>
      <button className={btn} tabIndex={-1} onPointerDown={(e) => handlePointerDown(e, KEY_PAGE_DOWN)}>
        <ChevronsDown size={18} />
      </button>

      <div className="w-px h-6 bg-slate-600/50 mx-0.5" />

      <button className={`${btn} bg-green-700/80 active:bg-green-600`} tabIndex={-1} onPointerDown={(e) => handlePointerDown(e, KEY_ENTER)}>
        <CornerDownLeft size={18} />
      </button>
      <button className={`${btn} bg-red-700/80 active:bg-red-600`} tabIndex={-1} onPointerDown={(e) => handlePointerDown(e, KEY_CTRL_C)}>
        <X size={14} className="mr-0.5" />C
      </button>
    </div>
  );
}
