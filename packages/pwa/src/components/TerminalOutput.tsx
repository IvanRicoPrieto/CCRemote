import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { stripAnsi, computeLinesToPush } from '../lib/screenDedup.js';

// Module-level scrollback storage — persists across component mounts
const scrollbackStore = new Map<string, string[]>();
const MAX_SCROLLBACK_LINES = 2000;

interface TerminalOutputProps {
  sessionId: string;
  screen: string;
  onResize?: (cols: number, rows: number) => void;
  onInput?: (data: string) => void;
  disableInput?: boolean;
}

export function TerminalOutput({ sessionId, screen, onResize, onInput, disableInput }: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;
  const disableInputRef = useRef(disableInput);
  disableInputRef.current = disableInput;

  const isFirstWriteRef = useRef(true);
  const lastRawLinesRef = useRef<string[]>([]);
  const lastStrippedLinesRef = useRef<string[]>([]);
  const lastStrippedJoinedRef = useRef('');

  function writeToTerminal(content: string) {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const rows = terminal.rows;
    const buf = terminal.buffer.active;
    const wasScrolledUp = buf.viewportY < buf.baseY;
    const savedViewportY = wasScrolledUp ? buf.viewportY : -1;

    const newRawLines = content.split('\n');
    const newStrippedLines = newRawLines.map(stripAnsi);

    let pushContent = '';

    if (isFirstWriteRef.current) {
      // On first write, restore scrollback from previous mount
      const stored = scrollbackStore.get(sessionId);
      if (stored && stored.length > 0) {
        const scrollbackContent = stored.map(l => l + '\x1b[K').join('\n');
        // Write stored lines then push them all to scrollback
        terminal.write(scrollbackContent + '\n' + `\x1b[${rows};1H` + '\n'.repeat(rows));
      }
    } else {
      const { linesToPush } = computeLinesToPush(
        lastRawLinesRef.current,
        lastStrippedLinesRef.current,
        newRawLines,
        newStrippedLines,
      );

      if (linesToPush.length > 0) {
        pushContent = `\x1b[${rows};1H` + '\n'.repeat(linesToPush.length);
        // Store pushed lines for scrollback persistence across mounts
        const existing = scrollbackStore.get(sessionId) || [];
        existing.push(...linesToPush);
        if (existing.length > MAX_SCROLLBACK_LINES) {
          existing.splice(0, existing.length - MAX_SCROLLBACK_LINES);
        }
        scrollbackStore.set(sessionId, existing);
      }
    }

    isFirstWriteRef.current = false;
    lastRawLinesRef.current = newRawLines;
    lastStrippedLinesRef.current = newStrippedLines;

    const formatted = newRawLines.map(l => l + '\x1b[K').join('\n');

    terminal.write(pushContent + '\x1b[H' + formatted + '\x1b[0J', () => {
      if (savedViewportY >= 0) {
        terminal.scrollToLine(savedViewportY);
      }
    });
  }

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      convertEol: true,
      scrollback: 5000,
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
      // Scroll to bottom on user input
      terminal.scrollToBottom();
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

  // Manual touch scroll for mobile (xterm.js viewport touch events are blocked by .xterm-screen overlay)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let startY = 0;
    let accum = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      accum = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const terminal = terminalRef.current;
      if (!terminal) return;

      const currentY = e.touches[0].clientY;
      const deltaY = startY - currentY;
      startY = currentY;

      const el = terminal.element;
      if (!el) return;
      const lineHeight = el.clientHeight / terminal.rows;

      accum += deltaY;
      const lines = Math.trunc(accum / lineHeight);
      if (lines !== 0) {
        terminal.scrollLines(lines);
        accum -= lines * lineHeight;
      }

      e.preventDefault();
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  // New screen from server: dedup and display
  useEffect(() => {
    if (!screen || !terminalRef.current) return;

    const stripped = screen.split('\n').map(stripAnsi).join('\n');
    if (stripped !== lastStrippedJoinedRef.current) {
      lastStrippedJoinedRef.current = stripped;
      writeToTerminal(screen);
    }
  }, [screen]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
