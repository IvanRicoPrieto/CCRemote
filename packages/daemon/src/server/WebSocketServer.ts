import { WebSocketServer as WSServer, WebSocket } from 'ws';
import type { IncomingMessage, Server as HTTPServer } from 'node:http';
import type { Server as HTTPSServer } from 'node:https';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import type Database from 'better-sqlite3';
import type {
  ClientMessage,
  ServerMessage,
  SessionInfo,
} from '@ccremote/shared';
import { validateToken } from '../auth/TokenAuth.js';
import { SessionManager } from '../session/SessionManager.js';
import { capabilities } from '../capabilities/ClaudeCapabilities.js';
import type { InputRequiredEvent } from '../session/OutputParser.js';

interface AuthenticatedClient {
  ws: WebSocket;
  authenticated: boolean;
  cols: number;
  rows: number;
}

export class WebSocketServerWrapper {
  private wss: WSServer;
  private clients: Set<AuthenticatedClient> = new Set();
  private sessionManager: SessionManager;
  private db: Database.Database;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(
    server: HTTPServer | HTTPSServer,
    db: Database.Database,
    sessionManager: SessionManager
  ) {
    this.db = db;
    this.sessionManager = sessionManager;

    this.wss = new WSServer({ server });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.setupSessionManagerListeners();
    this.startPingInterval();
  }

  private setupSessionManagerListeners(): void {
    this.sessionManager.on('session_created', (session: SessionInfo) => {
      this.broadcast({ type: 'session_created', payload: { session } });
    });

    this.sessionManager.on('session_updated', (session: SessionInfo) => {
      this.broadcast({ type: 'session_updated', payload: { session } });
    });

    this.sessionManager.on('session_killed', (sessionId: string) => {
      this.broadcast({ type: 'session_killed', payload: { sessionId } });
    });

    this.sessionManager.on('input_required', (sessionId: string, event: InputRequiredEvent) => {
      this.broadcast({
        type: 'input_required',
        payload: {
          sessionId,
          inputType: event.type,
          context: event.context,
          question: event.question,
          options: event.options,
          timestamp: event.timestamp,
        },
      });
    });

    this.sessionManager.on('output', (sessionId: string, data: string) => {
      this.broadcast({
        type: 'output_update',
        payload: { sessionId, content: data },
      });
    });

    this.sessionManager.on('context_limit', (sessionId: string, context: string) => {
      this.broadcast({
        type: 'context_limit',
        payload: { sessionId, message: context },
      });
    });
  }

  private handleConnection(ws: WebSocket, _req: IncomingMessage): void {
    const client: AuthenticatedClient = { ws, authenticated: false, cols: 0, rows: 0 };
    this.clients.add(client);

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        this.handleMessage(client, message);
      } catch (error) {
        this.sendError(ws, 'Invalid message format');
      }
    });

    ws.on('close', () => {
      this.clients.delete(client);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.clients.delete(client);
    });
  }

  private handleMessage(client: AuthenticatedClient, message: ClientMessage): void {
    // Auth must be first message
    if (!client.authenticated && message.type !== 'auth') {
      this.sendError(client.ws, 'Not authenticated');
      client.ws.close();
      return;
    }

    switch (message.type) {
      case 'auth':
        this.handleAuth(client, message.payload.token);
        break;
      case 'ping':
        this.send(client.ws, { type: 'pong', payload: {} });
        break;
      case 'get_sessions':
        this.send(client.ws, {
          type: 'sessions_list',
          payload: { sessions: this.sessionManager.getAllSessionInfos() },
        });
        break;
      case 'get_output':
        this.handleGetOutput(client.ws, message.payload.sessionId, message.payload.lines);
        break;
      case 'create_session':
        this.handleCreateSession(client.ws, message.payload);
        break;
      case 'kill_session':
        this.handleKillSession(client.ws, message.payload.sessionId);
        break;
      case 'restart_session':
        this.handleRestartSession(client.ws, message.payload.sessionId, message.payload.withSummary);
        break;
      case 'send_input':
        this.handleSendInput(client.ws, message.payload.sessionId, message.payload.input);
        break;
      case 'send_command':
        this.handleSendCommand(client.ws, message.payload.sessionId, message.payload.command);
        break;
      case 'change_model':
        this.handleChangeModel(client.ws, message.payload.sessionId, message.payload.model);
        break;
      case 'toggle_mode':
        this.handleToggleMode(
          client.ws,
          message.payload.sessionId,
          message.payload.mode,
          message.payload.enabled
        );
        break;
      case 'send_key':
        this.handleSendKey(client, message.payload.sessionId, message.payload.key);
        break;
      case 'resize_terminal':
        this.handleResizeTerminal(client, message.payload);
        break;
      case 'browse_directory':
        this.handleBrowseDirectory(client.ws, message.payload.path);
        break;
    }
  }

  private handleAuth(client: AuthenticatedClient, token: string): void {
    if (validateToken(this.db, token)) {
      client.authenticated = true;
      this.send(client.ws, { type: 'auth_result', payload: { success: true } });
      // Send capabilities and current sessions
      this.send(client.ws, { type: 'capabilities', payload: capabilities });
      this.send(client.ws, {
        type: 'sessions_list',
        payload: { sessions: this.sessionManager.getAllSessionInfos() },
      });
    } else {
      this.send(client.ws, { type: 'auth_result', payload: { success: false } });
      client.ws.close();
    }
  }

  private handleGetOutput(ws: WebSocket, sessionId: string, lines?: number): void {
    const output = this.sessionManager.getOutput(sessionId, lines);
    if (output !== null) {
      this.send(ws, { type: 'output_update', payload: { sessionId, content: output } });
    } else {
      this.sendError(ws, `Session ${sessionId} not found`, sessionId);
    }
  }

  private handleCreateSession(
    ws: WebSocket,
    payload: { projectPath: string; model?: string; planMode?: boolean; sessionType?: string }
  ): void {
    try {
      this.sessionManager.createSession({
        projectPath: payload.projectPath,
        model: payload.model,
        planMode: payload.planMode,
        sessionType: (payload.sessionType as 'claude' | 'shell') ?? 'claude',
      });
    } catch (error) {
      this.sendError(ws, `Failed to create session: ${(error as Error).message}`);
    }
  }

  private handleKillSession(ws: WebSocket, sessionId: string): void {
    if (!this.sessionManager.killSession(sessionId)) {
      this.sendError(ws, `Session ${sessionId} not found`, sessionId);
    }
  }

  private async handleRestartSession(
    ws: WebSocket,
    sessionId: string,
    withSummary: boolean
  ): Promise<void> {
    try {
      await this.sessionManager.restartSession(sessionId, withSummary);
    } catch (error) {
      this.sendError(ws, `Failed to restart session: ${(error as Error).message}`, sessionId);
    }
  }

  private handleSendInput(ws: WebSocket, sessionId: string, input: string): void {
    if (!this.sessionManager.sendInput(sessionId, input)) {
      this.sendError(ws, `Session ${sessionId} not found`, sessionId);
    }
  }

  private handleSendKey(client: AuthenticatedClient, sessionId: string, key: string): void {
    // Auto-resize tmux to this client's dimensions if they differ
    if (client.cols > 0 && client.rows > 0) {
      const session = this.sessionManager.getSession(sessionId);
      if (session && (session.cols !== client.cols || session.rows !== client.rows)) {
        this.sessionManager.resizeSession(sessionId, client.cols, client.rows);
      }
    }
    if (!this.sessionManager.sendKey(sessionId, key)) {
      this.sendError(client.ws, `Session ${sessionId} not found`, sessionId);
    }
  }

  private handleResizeTerminal(client: AuthenticatedClient, payload: { sessionId: string; cols: number; rows: number }): void {
    client.cols = payload.cols;
    client.rows = payload.rows;
    if (!this.sessionManager.resizeSession(payload.sessionId, payload.cols, payload.rows)) {
      this.sendError(client.ws, `Session ${payload.sessionId} not found`, payload.sessionId);
    }
  }

  private handleSendCommand(ws: WebSocket, sessionId: string, command: string): void {
    if (!this.sessionManager.sendCommand(sessionId, command)) {
      this.sendError(ws, `Session ${sessionId} not found`, sessionId);
    }
  }

  private async handleChangeModel(ws: WebSocket, sessionId: string, model: string): Promise<void> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      this.sendError(ws, `Session ${sessionId} not found`, sessionId);
      return;
    }

    try {
      await this.sessionManager.restartSession(sessionId, true, model);
    } catch (error) {
      this.sendError(ws, `Failed to change model: ${(error as Error).message}`, sessionId);
    }
  }

  private handleToggleMode(
    ws: WebSocket,
    sessionId: string,
    mode: string,
    _enabled: boolean
  ): void {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      this.sendError(ws, `Session ${sessionId} not found`, sessionId);
      return;
    }

    if (mode === 'plan') {
      // Plan mode can be toggled at runtime via slash command
      this.sessionManager.sendCommand(sessionId, '/plan');
      this.send(ws, {
        type: 'session_updated',
        payload: { session: session.getInfo() },
      });
    } else if (mode === 'auto-accept') {
      this.sendError(ws, 'Changing auto-accept requires restarting the session', sessionId);
    } else {
      this.sendError(ws, `Unknown mode: ${mode}`, sessionId);
    }
  }

  private async handleBrowseDirectory(ws: WebSocket, path: string): Promise<void> {
    const resolvedPath = path === '~' || path === '' ? homedir() : path.replace(/^~\//, homedir() + '/');
    try {
      const entries = await readdir(resolvedPath, { withFileTypes: true });
      const directories = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      this.send(ws, {
        type: 'directory_listing',
        payload: { path: resolvedPath, directories },
      });
    } catch {
      this.send(ws, {
        type: 'directory_listing',
        payload: { path: resolvedPath, directories: [], error: 'No se puede leer el directorio' },
      });
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, message: string, sessionId?: string): void {
    this.send(ws, { type: 'error', payload: { message, sessionId } });
  }

  private broadcast(message: ServerMessage): void {
    for (const client of this.clients) {
      if (client.authenticated) {
        this.send(client.ws, message);
      }
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      for (const client of this.clients) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      }
    }, 30000);
  }

  close(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    for (const client of this.clients) {
      client.ws.close();
    }
    this.wss.close();
  }
}
