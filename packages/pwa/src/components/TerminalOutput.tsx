import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { stripAnsi } from '../lib/screenDedup.js';

interface TerminalOutputProps {
  sessionId: string;
  screen: string;
  onResize?: (cols: number, rows: number) => void;
  onInput?: (data: string) => void;
  onRequestScrollback?: () => void;
  disableInput?: boolean;
}

export function TerminalOutput({ sessionId, screen, onResize, onInput, onRequestScrollback, disableInput }: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;
  const onRequestScrollbackRef = useRef(onRequestScrollback);
  onRequestScrollbackRef.current = onRequestScrollback;
  const disableInputRef = useRef(disableInput);
  disableInputRef.current = disableInput;

  const lastStrippedRef = useRef('');

  function writeToTerminal(content: string) {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const rows = terminal.rows;
    const lines = content.split('\n').slice(0, rows);
    const formatted = lines.map(l => l + '\x1b[K').join('\n');
    terminal.write('\x1b[H' + formatted + '\x1b[0J');
  }

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      convertEol: true,
      scrollback: 0,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#e2e8f0',
        selectionBackground: '#334155',
        black: '#1e293b',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e2e8f0',
        brightBlack: '#475569',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f8fafc',
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    // Prevent virtual keyboard on mobile when disableInput is set
    const textarea = containerRef.current?.querySelector(
      '.xterm-helper-textarea'
    ) as HTMLTextAreaElement | null;
    if (textarea && disableInputRef.current) {
      textarea.setAttribute('inputmode', 'none');
    }

    fitAddon.fit();
    onResizeRef.current?.(terminal.cols, terminal.rows);

    terminal.onData((data) => {
      if (!disableInputRef.current) {
        onInputRef.current?.(data);
      }
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    return () => {
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Update inputmode when disableInput changes
  useEffect(() => {
    const textarea = containerRef.current?.querySelector(
      '.xterm-helper-textarea'
    ) as HTMLTextAreaElement | null;
    if (textarea) {
      if (disableInput) {
        textarea.setAttribute('inputmode', 'none');
      } else {
        textarea.removeAttribute('inputmode');
      }
    }
  }, [disableInput]);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const doFit = () => {
      fitAddonRef.current?.fit();
      const t = terminalRef.current;
      if (t) onResizeRef.current?.(t.cols, t.rows);
    };

    const resizeObserver = new ResizeObserver(doFit);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Mouse wheel up → request scrollback overlay
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        e.preventDefault();
        onRequestScrollbackRef.current?.();
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  // Touch swipe up → request scrollback overlay
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches.length !== 1) return;
      const deltaY = startY - e.changedTouches[0].clientY;
      if (deltaY > 80) {
        onRequestScrollbackRef.current?.();
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  // New screen from server: dedup and display
  useEffect(() => {
    if (!screen || !terminalRef.current) return;

    const rows = terminalRef.current.rows;
    const stripped = screen.split('\n').slice(0, rows).map(stripAnsi).join('\n');
    if (stripped !== lastStrippedRef.current) {
      lastStrippedRef.current = stripped;
      writeToTerminal(screen);
    }
  }, [screen]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
