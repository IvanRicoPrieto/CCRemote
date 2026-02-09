import { EventEmitter } from 'node:events';
import type { SessionConfig, SessionInfo } from '@ccremote/shared';
import { ClaudeSession, type ClaudeSessionEvents } from './ClaudeSession.js';
import type { InputRequiredEvent } from './OutputParser.js';

export interface SessionManagerEvents {
  session_created: (session: SessionInfo) => void;
  session_updated: (session: SessionInfo) => void;
  session_killed: (sessionId: string) => void;
  input_required: (sessionId: string, event: InputRequiredEvent) => void;
  output: (sessionId: string, data: string) => void;
  context_limit: (sessionId: string, context: string) => void;
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, ClaudeSession> = new Map();

  createSession(config: SessionConfig): ClaudeSession {
    const session = new ClaudeSession(config);

    session.on('state_change', () => {
      this.emit('session_updated', session.getInfo());
    });

    session.on('input_required', (event: InputRequiredEvent) => {
      this.emit('input_required', session.id, event);
    });

    session.on('output', (data: string) => {
      this.emit('output', session.id, data);
    });

    session.on('context_limit', (context: string) => {
      this.emit('context_limit', session.id, context);
    });

    session.on('exit', () => {
      this.emit('session_updated', session.getInfo());
    });

    this.sessions.set(session.id, session);
    session.start();

    this.emit('session_created', session.getInfo());
    return session;
  }

  getSession(id: string): ClaudeSession | null {
    return this.sessions.get(id) ?? null;
  }

  getAllSessions(): ClaudeSession[] {
    return Array.from(this.sessions.values());
  }

  getAllSessionInfos(): SessionInfo[] {
    return this.getAllSessions().map((s) => s.getInfo());
  }

  killSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) {
      return false;
    }

    session.kill();
    this.sessions.delete(id);
    this.emit('session_killed', id);
    return true;
  }

  async restartSession(id: string, withSummary: boolean = false, newModel?: string): Promise<ClaudeSession> {
    const oldSession = this.sessions.get(id);
    if (!oldSession) {
      throw new Error(`Session ${id} not found`);
    }

    const config = { ...oldSession.config };
    if (newModel) {
      config.model = newModel;
    }

    let initialMessage: string | undefined;

    if (withSummary) {
      const recentOutput = oldSession.getRecentOutput(100);
      initialMessage = `Continuación de sesión anterior. Contexto reciente:\n${recentOutput}`;
    }

    this.killSession(id);

    const newSession = this.createSession(config);

    if (initialMessage) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      newSession.sendInput(initialMessage);
    }

    return newSession;
  }

  sendInput(sessionId: string, input: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.sendInput(input);
    return true;
  }

  sendKey(sessionId: string, key: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.sendKey(key);
    return true;
  }

  resizeSession(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.resize(cols, rows);
    return true;
  }

  sendCommand(sessionId: string, command: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    // Commands are just sent as regular input
    session.sendInput(command);
    return true;
  }

  getOutput(sessionId: string, lines: number = 50): string | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    return session.getRecentOutput(lines);
  }

  killAll(): void {
    for (const session of this.sessions.values()) {
      session.kill();
    }
    this.sessions.clear();
  }
}
