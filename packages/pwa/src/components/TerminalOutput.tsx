import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalOutputProps {
  screen: string;
  onResize?: (cols: number, rows: number) => void;
  onInput?: (data: string) => void;
}

export function TerminalOutput({ screen, onResize, onInput }: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;

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
    fitAddon.fit();
    onResizeRef.current?.(terminal.cols, terminal.rows);

    terminal.onData((data) => {
      onInputRef.current?.(data);
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Forward mouse wheel as Page Up / Page Down to the remote session
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        onInputRef.current?.('\x1b[5~'); // Page Up
      } else if (e.deltaY > 0) {
        onInputRef.current?.('\x1b[6~'); // Page Down
      }
    };
    containerRef.current!.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      containerRef.current?.removeEventListener('wheel', handleWheel);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
      const t = terminalRef.current;
      if (t) onResizeRef.current?.(t.cols, t.rows);
    });
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Write screen snapshot
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !screen) return;

    terminal.reset();
    terminal.write(screen);
  }, [screen]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
    />
  );
}
