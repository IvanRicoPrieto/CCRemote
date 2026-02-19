import { useState, useRef, useCallback } from 'react';
import { Send } from 'lucide-react';

interface MobileInputProps {
  onSend: (data: string) => void;
}

export function MobileInput({ onSend }: MobileInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    // Clamp between 1 and 4 lines (line-height ~20px + padding)
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    autoResize(e.target);
  }, [autoResize]);

  const sendText = useCallback(() => {
    const text = value.trim();
    if (!text) {
      // Empty text: just send Enter (submit)
      onSend('\r');
      return;
    }
    // Send each line separated by \r (Enter in terminal)
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) {
        onSend(lines[i]);
      }
      if (i < lines.length - 1) {
        onSend('\r');
      }
    }
    onSend('\r');
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, onSend]);

  return (
    <div className="flex items-end gap-1.5 px-2 py-1.5 bg-slate-800/95 border-t border-slate-700/50">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        rows={1}
        autoComplete="on"
        autoCorrect="on"
        autoCapitalize="sentences"
        spellCheck={false}
        placeholder="Escribe aqui..."
        className="flex-1 min-h-[40px] max-h-[96px] px-3 py-2.5 rounded-lg bg-slate-700/80 text-slate-200 text-sm placeholder-slate-400 outline-none focus:ring-1 focus:ring-indigo-500/50 resize-none leading-5"
      />
      <button
        tabIndex={-1}
        onPointerDown={(e) => { e.preventDefault(); sendText(); }}
        className="flex items-center justify-center h-10 w-10 shrink-0 rounded-lg bg-indigo-600/80 active:bg-indigo-500 text-white select-none touch-manipulation"
      >
        <Send size={18} />
      </button>
    </div>
  );
}
