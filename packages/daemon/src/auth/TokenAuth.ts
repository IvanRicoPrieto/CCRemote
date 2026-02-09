import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

const TOKEN_KEY = 'auth_token';

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function getOrCreateToken(db: Database.Database): string {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(TOKEN_KEY) as { value: string } | undefined;

  if (row) {
    return row.value;
  }

  const token = generateToken();
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(TOKEN_KEY, token);
  return token;
}

export function getToken(db: Database.Database): string | null {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(TOKEN_KEY) as { value: string } | undefined;
  return row?.value ?? null;
}

export function regenerateToken(db: Database.Database): string {
  const token = generateToken();
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(TOKEN_KEY, token);
  return token;
}

export function validateToken(db: Database.Database, token: string): boolean {
  const storedToken = getToken(db);
  if (!storedToken) return false;
  return crypto.timingSafeEqual(Buffer.from(storedToken), Buffer.from(token));
}
