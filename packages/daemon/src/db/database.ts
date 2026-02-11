import Database from 'better-sqlite3';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

const CONFIG_DIR = join(homedir(), '.ccremote');
const DB_PATH = join(CONFIG_DIR, 'ccremote.db');

export function ensureConfigDir(): string {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  return CONFIG_DIR;
}

export function getDatabase(): Database.Database {
  ensureConfigDir();
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

export function initializeDatabase(db: Database.Database): void {
  db.exec(`
    -- Sessions table
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_path TEXT NOT NULL,
      model TEXT NOT NULL,
      plan_mode INTEGER DEFAULT 0,
      auto_accept INTEGER DEFAULT 0,
      state TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      summary TEXT
    );

    -- Session output history
    CREATE TABLE IF NOT EXISTS session_output (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    -- Session input history
    CREATE TABLE IF NOT EXISTS session_inputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      input TEXT NOT NULL,
      source TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    -- Configuration
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_session_output_session_id ON session_output(session_id);
    CREATE INDEX IF NOT EXISTS idx_session_inputs_session_id ON session_inputs(session_id);
  `);

  // Migration: add session_type column if missing
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN session_type TEXT NOT NULL DEFAULT 'claude'`);
  } catch {
    // Column already exists
  }
}

// --- Session persistence helpers ---

export interface SessionRow {
  id: string;
  project_path: string;
  model: string;
  plan_mode: number;
  auto_accept: number;
  state: string;
  session_type: string;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
}

export function insertSession(db: Database.Database, row: SessionRow): void {
  db.prepare(`
    INSERT INTO sessions (id, project_path, model, plan_mode, auto_accept, state, session_type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id, row.project_path, row.model,
    row.plan_mode, row.auto_accept, row.state,
    row.session_type, row.created_at, row.updated_at
  );
}

export function updateSessionState(db: Database.Database, id: string, state: string): void {
  db.prepare(`UPDATE sessions SET state = ?, updated_at = datetime('now') WHERE id = ?`).run(state, id);
}

export function endSession(db: Database.Database, id: string): void {
  db.prepare(`UPDATE sessions SET state = 'dead', ended_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(id);
}

export function getActiveSessions(db: Database.Database): SessionRow[] {
  return db.prepare(`SELECT * FROM sessions WHERE ended_at IS NULL`).all() as SessionRow[];
}

export function getSessionById(db: Database.Database, id: string): SessionRow | undefined {
  return db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as SessionRow | undefined;
}

export { CONFIG_DIR, DB_PATH };
