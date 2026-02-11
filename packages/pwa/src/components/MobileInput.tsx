import { useState, useRef, useCallback } from 'react';
import { Send } from 'lucide-react';

interface MobileInputProps {
  onSend: (data: string) => void;
}

export function MobileInput({ onSend }: MobileInputProps) {
  const [value, setValue] = useState('');
  const prevValueRef = useRef('');

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const prevValue = prevValueRef.current;

    // Find common prefix length
    let common = 0;
    while (
      common < prevValue.length &&
      common < newValue.length &&
      prevValue[common] === newValue[common]
    ) {
      common++;
    }

    // Send backspaces for removed characters
    const deletions = prevValue.length - common;
    for (let i = 0; i < deletions; i++) {
      onSend('\x7f'); // Backspace
    }

    // Send new characters as literal text
    const added = newValue.slice(common);
    if (added) {
      onSend(added);
    }

    prevValueRef.current = newValue;
    setValue(newValue);
  }, [onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSend('\r');
      setValue('');
      prevValueRef.current = '';
    }
  }, [onSend]);

  const handleSendTap = useCallback(() => {
    onSend('\r');
    setValue('');
    prevValueRef.current = '';
  }, [onSend]);

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-800/95 border-t border-slate-700/50">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        autoComplete="on"
        autoCorrect="on"
        autoCapitalize="sentences"
        spellCheck={false}
        placeholder="Escribe aqui..."
        className="flex-1 h-10 px-3 rounded-lg bg-slate-700/80 text-slate-200 text-sm placeholder-slate-400 outline-none focus:ring-1 focus:ring-indigo-500/50"
      />
      <button
        tabIndex={-1}
        onPointerDown={(e) => { e.preventDefault(); (document.activeElement as HTMLElement)?.blur(); handleSendTap(); }}
        className="flex items-center justify-center h-10 w-10 rounded-lg bg-indigo-600/80 active:bg-indigo-500 text-white select-none touch-manipulation"
      >
        <Send size={18} />
      </button>
    </div>
  );
}
