import { EventEmitter } from 'node:events';
import { execFileSync, execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import * as pty from 'node-pty';
import { nanoid } from 'nanoid';
import type { SessionState, SessionConfig, SessionInfo } from '@ccremote/shared';
import { OutputParser, type InputRequiredEvent } from './OutputParser.js';
import { DEFAULT_MODEL } from '../capabilities/ClaudeCapabilities.js';
import { basename } from 'node:path';

const execFile = promisify(execFileCb);

export interface ClaudeSessionEvents {
  state_change: (state: SessionState) => void;
  input_required: (event: InputRequiredEvent) => void;
  output: (data: string) => void;
  context_limit: (context: string) => void;
  exit: (code: number) => void;
}

export class ClaudeSession extends EventEmitter {
  readonly id: string;
  readonly config: Required<SessionConfig>;
  readonly createdAt: Date;

  private readerPty: pty.IPty | null = null;
  private parser: OutputParser;
  private _state: SessionState = 'starting';
  private _lastActivity: Date;
  private _tmuxSessionName: string;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private _cols: number = 120;
  private _rows: number = 40;

  // Screen capture mechanism
  private captureTimer: NodeJS.Timeout | null = null;
  private captureInFlight: boolean = false;
  private lastEmittedScreen: string = '';
  private hasReceivedResize: boolean = false;
  private readonly CAPTURE_DEBOUNCE_MS = 30;

  constructor(config: SessionConfig) {
    super();
    this.id = nanoid(12);
    this.config = {
      projectPath: config.projectPath,
      model: config.model ?? DEFAULT_MODEL,
      planMode: config.planMode ?? false,
      autoAccept: config.autoAccept ?? false,
    };
    this.createdAt = new Date();
    this._lastActivity = new Date();
    this._tmuxSessionName = `ccremote-${this.id}`;
    this.parser = new OutputParser();
    this.setupParserListeners();
  }

  private setupParserListeners(): void {
    this.parser.on('input_required', (event: InputRequiredEvent) => {
      if (event.type === 'confirmation') {
        this.setState('awaiting_confirmation');
      } else {
        this.setState('awaiting_input');
      }
      this.emit('input_required', event);
    });

    this.parser.on('working', () => {
      this.setState('working');
    });

    this.parser.on('context_limit', (context: string) => {
      this.setState('context_limit');
      this.emit('context_limit', context);
    });

    this.parser.on('possibly_idle', () => {
      if (this._state === 'working') {
        this.setState('idle');
      }
    });

    this.parser.on('activity', () => {
      this._lastActivity = new Date();
      // Don't capture until a client has sent a resize (so we know the right dimensions)
      if (this.hasReceivedResize) {
        this.scheduleCaptureScreen();
      }
    });
  }

  start(): void {
    const args = this.buildArgs();
    const claudeCmd = ['claude', ...args].join(' ');

    try {
      // Create a detached tmux session running claude
      execFileSync('tmux', [
        'new-session',
        '-d',
        '-s', this._tmuxSessionName,
        '-x', '120',
        '-y', '40',
        '-c', this.config.projectPath,
        '--', ...['sh', '-c', claudeCmd],
      ]);

      // Disable tmux status bar — it corrupts the terminal output for the PWA
      execFileSync('tmux', [
        'set-option', '-t', this._tmuxSessionName,
        'status', 'off',
      ]);

      // Use largest client for window size — so a native terminal (ccremote attach)
      // always dictates the size, even when a smaller PWA client is connected
      execFileSync('tmux', [
        'set-option', '-t', this._tmuxSessionName,
        'window-size', 'largest',
      ]);

      // Enable mouse support — allows scroll wheel in native terminals
      execFileSync('tmux', [
        'set-option', '-t', this._tmuxSessionName,
        'mouse', 'on',
      ]);

      // Attach a read-only pty to detect output changes (for OutputParser + capture trigger)
      this.readerPty = pty.spawn('tmux', [
        'attach-session',
        '-t', this._tmuxSessionName,
        '-r',
      ], {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        env: process.env as Record<string, string>,
      });

      this.readerPty.onData((data: string) => {
        this.parser.feed(data);
      });

      this.readerPty.onExit(() => {
        // Reader exited — check if tmux session is still alive
        if (!this.isTmuxAlive()) {
          this.setState('dead');
          this.emit('exit', 0);
        }
      });

      // Periodic health check
      this.healthCheckInterval = setInterval(() => {
        if (!this.isTmuxAlive()) {
          this.setState('dead');
          this.emit('exit', 0);
          this.stopHealthCheck();
        }
      }, 5000);

      this.setState('idle');
    } catch (error) {
      this.setState('error');
      throw error;
    }
  }

  private buildArgs(): string[] {
    const args: string[] = [];
    if (this.config.model) {
      args.push('--model', this.config.model);
    }
    if (this.config.planMode) {
      args.push('--plan');
    }
    if (this.config.autoAccept) {
      args.push('--dangerously-skip-permissions');
    }
    return args;
  }

  private isTmuxAlive(): boolean {
    try {
      execFileSync('tmux', ['has-session', '-t', this._tmuxSessionName], {
        stdio: 'ignore',
      });
      return true;
    } catch {
      return false;
    }
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // --- Screen capture mechanism ---

  private scheduleCaptureScreen(): void {
    if (this.captureTimer) {
      clearTimeout(this.captureTimer);
    }
    this.captureTimer = setTimeout(() => {
      this.captureTimer = null;
      void this.captureScreen();
    }, this.CAPTURE_DEBOUNCE_MS);
  }

  private async captureScreen(): Promise<void> {
    if (this.captureInFlight) return;
    this.captureInFlight = true;

    try {
      const { stdout: rawScreen } = await execFile('tmux', [
        'capture-pane', '-t', this._tmuxSessionName,
        '-p', '-e',
      ]);

      // Trim trailing whitespace from each line (prevents overflow when
      // xterm.js cols don't match tmux exactly) and strip trailing empty lines
      const screen = rawScreen
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
        .replace(/\n+$/, '\n');

      // Get cursor position
      let cursorY = 0;
      let cursorX = 0;
      try {
        const { stdout: pos } = await execFile('tmux', [
          'display-message', '-t', this._tmuxSessionName,
          '-p', '#{cursor_y},#{cursor_x}',
        ]);
        const parts = pos.trim().split(',');
        cursorY = parseInt(parts[0] ?? '0', 10);
        cursorX = parseInt(parts[1] ?? '0', 10);
      } catch {
        // Non-critical — cursor position may be slightly off
      }

      // Only emit if screen actually changed
      if (screen !== this.lastEmittedScreen) {
        this.lastEmittedScreen = screen;
        const cursorSeq = `\x1b[${cursorY + 1};${cursorX + 1}H`;
        this.emit('output', screen + cursorSeq);
      }
    } catch {
      // tmux session may have died
    } finally {
      this.captureInFlight = false;
    }
  }

  // --- Input ---

  sendInput(input: string): void {
    if (!this.isTmuxAlive()) {
      throw new Error('Session not started');
    }
    // Send text followed by Enter
    execFileSync('tmux', [
      'send-keys', '-t', this._tmuxSessionName,
      '-l', input,
    ]);
    execFileSync('tmux', [
      'send-keys', '-t', this._tmuxSessionName,
      'Enter',
    ]);
    this.setState('working');
  }

  sendKey(key: string): void {
    if (!this.isTmuxAlive()) {
      throw new Error('Session not started');
    }

    // Map special keys to tmux key names
    const tmuxKey = this.mapKeyToTmux(key);
    if (tmuxKey !== null) {
      execFileSync('tmux', [
        'send-keys', '-t', this._tmuxSessionName,
        tmuxKey,
      ]);
    } else {
      // Send literal characters
      execFileSync('tmux', [
        'send-keys', '-t', this._tmuxSessionName,
        '-l', key,
      ]);
    }
  }

  private mapKeyToTmux(key: string): string | null {
    switch (key) {
      case '\x03': return 'C-c';
      case '\x1b': return 'Escape';
      case '\r':
      case '\n': return 'Enter';
      case '\t': return 'Tab';
      case '\x7f':
      case '\b': return 'BSpace';
      case '\x1b[A': return 'Up';
      case '\x1b[B': return 'Down';
      case '\x1b[C': return 'Right';
      case '\x1b[D': return 'Left';
      case '\x1b[5~': return 'PageUp';
      case '\x1b[6~': return 'PageDown';
      default: return null;
    }
  }

  sendCtrlC(): void {
    this.sendKey('\x03');
  }

  getRecentOutput(_lines: number = 50): string {
    try {
      return execFileSync('tmux', [
        'capture-pane', '-t', this._tmuxSessionName,
        '-p', '-e',
      ], { encoding: 'utf8' });
    } catch {
      return '';
    }
  }

  get cols(): number {
    return this._cols;
  }

  get rows(): number {
    return this._rows;
  }

  get state(): SessionState {
    return this._state;
  }

  get lastActivity(): Date {
    return this._lastActivity;
  }

  get tmuxSession(): string {
    return this._tmuxSessionName;
  }

  private setState(state: SessionState): void {
    if (this._state !== state) {
      this._state = state;
      this._lastActivity = new Date();
      this.emit('state_change', state);
    }
  }

  getInfo(): SessionInfo {
    return {
      id: this.id,
      projectPath: this.config.projectPath,
      projectName: basename(this.config.projectPath),
      model: this.config.model,
      planMode: this.config.planMode,
      autoAccept: this.config.autoAccept,
      state: this._state,
      createdAt: this.createdAt.toISOString(),
      lastActivity: this._lastActivity.toISOString(),
      tmuxSession: this._tmuxSessionName,
    };
  }

  kill(): void {
    this.stopHealthCheck();

    if (this.captureTimer) {
      clearTimeout(this.captureTimer);
      this.captureTimer = null;
    }

    // Kill the reader pty
    if (this.readerPty) {
      this.readerPty.kill();
      this.readerPty = null;
    }

    // Kill the tmux session
    try {
      execFileSync('tmux', ['kill-session', '-t', this._tmuxSessionName], {
        stdio: 'ignore',
      });
    } catch {
      // Session may already be dead
    }

    this.parser.destroy();
    this.setState('dead');
  }

  resize(cols: number, rows: number): void {
    this.hasReceivedResize = true;

    // Only resize the reader PTY — tmux with window-size=largest will
    // automatically pick the largest attached client (native terminal if present).
    // This prevents mobile PWA resizes from shrinking a native terminal.
    if (this.readerPty) {
      this.readerPty.resize(cols, rows);
    }

    this._cols = cols;
    this._rows = rows;
    this.lastEmittedScreen = ''; // Force re-emit after resize

    // Delay capture to let the TUI app (Claude Code) re-render after SIGWINCH
    setTimeout(() => {
      void this.captureScreen();
    }, 150);
  }
}
