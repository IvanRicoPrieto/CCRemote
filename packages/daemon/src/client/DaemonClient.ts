import WebSocket from 'ws';
import type { ClientMessage, ServerMessage } from '@ccremote/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR } from '../db/database.js';

const PID_FILE = join(CONFIG_DIR, 'daemon.pid');
const DEFAULT_PORT = 9876;

export class DaemonClient {
  private ws: WebSocket | null = null;
  private messageQueue: Array<{
    resolve: (msg: ServerMessage) => void;
    reject: (err: Error) => void;
    expectedType?: string;
  }> = [];
  private messageListeners: Array<(msg: ServerMessage) => void> = [];

  constructor(
    private url: string,
    private token: string
  ) {}

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url, {
        rejectUnauthorized: false, // localhost with Tailscale cert
      });
      this.ws = ws;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Connection timeout'));
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        ws.send(JSON.stringify({ type: 'auth', payload: { token: this.token } }));
      });

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString()) as ServerMessage;

        if (message.type === 'auth_result') {
          if (message.payload.success) {
            resolve();
          } else {
            ws.close();
            reject(new Error('Authentication failed'));
          }
          return;
        }

        // Check if there's a pending request waiting for this type
        const pending = this.messageQueue[0];
        if (pending && (!pending.expectedType || pending.expectedType === message.type)) {
          this.messageQueue.shift();
          pending.resolve(message);
        }

        // Notify continuous listeners
        for (const listener of this.messageListeners) {
          listener(message);
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      ws.on('close', () => {
        clearTimeout(timeout);
        for (const pending of this.messageQueue) {
          pending.reject(new Error('Connection closed'));
        }
        this.messageQueue = [];
      });
    });
  }

  send(message: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }
    this.ws.send(JSON.stringify(message));
  }

  async sendAndWait<T extends ServerMessage>(
    message: ClientMessage,
    expectedType: T['type'],
    timeoutMs: number = 10000
  ): Promise<T> {
    this.send(message);
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = this.messageQueue.findIndex((p) => p.resolve === resolve as unknown);
        if (idx !== -1) this.messageQueue.splice(idx, 1);
        reject(new Error('Response timeout'));
      }, timeoutMs);

      this.messageQueue.push({
        resolve: (msg) => {
          clearTimeout(timeout);
          resolve(msg as T);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
        expectedType,
      });
    });
  }

  onMessage(listener: (msg: ServerMessage) => void): void {
    this.messageListeners.push(listener);
  }

  onClose(listener: () => void): void {
    this.ws?.on('close', listener);
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}

export async function connectToDaemon(port: number = DEFAULT_PORT): Promise<DaemonClient> {
  const { getDatabase, initializeDatabase } = await import('../db/database.js');
  const { getOrCreateToken } = await import('../auth/TokenAuth.js');
  const db = getDatabase();
  initializeDatabase(db);
  const token = getOrCreateToken(db);
  db.close();

  // Try wss:// first (daemon may be running with HTTPS), then ws://
  for (const protocol of ['wss', 'ws'] as const) {
    try {
      const url = `${protocol}://127.0.0.1:${port}`;
      const client = new DaemonClient(url, token);
      await client.connect();
      return client;
    } catch {
      // Try next protocol
    }
  }
  throw new Error(`Could not connect to daemon on port ${port}`);
}
