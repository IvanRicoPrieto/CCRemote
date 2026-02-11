import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import type Database from 'better-sqlite3';
import type { SessionConfig, SessionInfo } from '@ccremote/shared';
import { ClaudeSession, type ClaudeSessionEvents } from './ClaudeSession.js';
import type { InputRequiredEvent } from './OutputParser.js';
import {
  insertSession,
  updateSessionState,
  endSession as endSessionInDb,
  getActiveSessions,
  getSessionById,
  type SessionRow,
} from '../db/database.js';

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
  private db: Database.Database | null;

  constructor(db?: Database.Database) {
    super();
    this.db = db ?? null;
  }

  private wireSessionEvents(session: ClaudeSession): void {
    session.on('state_change', () => {
      this.emit('session_updated', session.getInfo());
      if (this.db) {
        updateSessionState(this.db, session.id, session.state);
      }
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
      if (this.db) {
        endSessionInDb(this.db, session.id);
      }
    });
  }

  createSession(config: SessionConfig): ClaudeSession {
    const session = new ClaudeSession(config);

    this.wireSessionEvents(session);
    this.sessions.set(session.id, session);
    session.start();

    if (this.db) {
      insertSession(this.db, {
        id: session.id,
        project_path: session.config.projectPath,
        model: session.config.model,
        plan_mode: session.config.planMode ? 1 : 0,
        auto_accept: session.config.autoAccept ? 1 : 0,
        state: session.state,
        session_type: session.config.sessionType,
        created_at: session.createdAt.toISOString(),
        updated_at: new Date().toISOString(),
        ended_at: null,
      });
    }

    this.emit('session_created', session.getInfo());
    return session;
  }

  /**
   * Rediscover tmux sessions that survived a daemon restart.
   * Returns the number of sessions reconnected.
   */
  rediscoverSessions(): number {
    // List all tmux sessions whose name starts with ccremote-
    let tmuxNames: string[];
    try {
      const raw = execFileSync('tmux', [
        'list-sessions', '-F', '#{session_name}',
      ], { encoding: 'utf8' });
      tmuxNames = raw.trim().split('\n').filter(n => n.startsWith('ccremote-'));
    } catch {
      // tmux server not running or no sessions
      tmuxNames = [];
    }

    let reconnected = 0;

    for (const tmuxName of tmuxNames) {
      const sessionId = tmuxName.replace('ccremote-', '');

      // Skip if we already have this session loaded
      if (this.sessions.has(sessionId)) continue;

      // Look up in DB for config
      let config: SessionConfig;
      if (this.db) {
        const row = getSessionById(this.db, sessionId);
        if (row) {
          config = {
            projectPath: row.project_path,
            model: row.model,
            planMode: row.plan_mode === 1,
            autoAccept: row.auto_accept === 1,
            sessionType: (row.session_type as 'claude' | 'shell') ?? 'claude',
          };
        } else {
          // tmux session exists but no DB record — create minimal config
          config = { projectPath: process.cwd() };
        }
      } else {
        config = { projectPath: process.cwd() };
      }

      try {
        const session = new ClaudeSession(config, sessionId);
        this.wireSessionEvents(session);
        this.sessions.set(session.id, session);
        session.attachToExisting();

        if (session.state === 'dead') {
          // tmux was actually dead
          this.sessions.delete(session.id);
          if (this.db) {
            endSessionInDb(this.db, session.id);
          }
          continue;
        }

        // Ensure DB record exists
        if (this.db && !getSessionById(this.db, sessionId)) {
          insertSession(this.db, {
            id: session.id,
            project_path: session.config.projectPath,
            model: session.config.model,
            plan_mode: session.config.planMode ? 1 : 0,
            auto_accept: session.config.autoAccept ? 1 : 0,
            state: session.state,
            session_type: session.config.sessionType,
            created_at: session.createdAt.toISOString(),
            updated_at: new Date().toISOString(),
            ended_at: null,
          });
        }

        this.emit('session_created', session.getInfo());
        reconnected++;
      } catch (error) {
        console.error(`Failed to reconnect session ${sessionId}:`, error);
      }
    }

    // Clean up DB entries whose tmux sessions no longer exist
    if (this.db) {
      const activeRows = getActiveSessions(this.db);
      for (const row of activeRows) {
        if (!this.sessions.has(row.id)) {
          endSessionInDb(this.db, row.id);
        }
      }
    }

    return reconnected;
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
    if (this.db) {
      endSessionInDb(this.db, id);
    }
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

  /** Disconnect all sessions without killing tmux (for graceful daemon shutdown). */
  disconnectAll(): void {
    for (const session of this.sessions.values()) {
      session.disconnect();
    }
    this.sessions.clear();
  }

  killAll(): void {
    for (const session of this.sessions.values()) {
      session.kill();
    }
    this.sessions.clear();
  }
}
