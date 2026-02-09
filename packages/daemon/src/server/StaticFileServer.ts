import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

export function createStaticHandler(rootDir: string) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    let pathname = decodeURIComponent(url.pathname);

    // Protect against directory traversal
    const resolved = normalize(join(rootDir, pathname));
    if (!resolved.startsWith(rootDir)) {
      res.writeHead(403);
      res.end();
      return;
    }

    // Try serving the file directly, then with index.html, then SPA fallback
    const paths = [
      resolved,
      pathname.endsWith('/') ? join(resolved, 'index.html') : null,
    ].filter((p): p is string => p !== null);

    for (const filePath of paths) {
      try {
        const content = await readFile(filePath);
        const ext = extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': content.length,
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
        });
        if (req.method === 'HEAD') {
          res.end();
        } else {
          res.end(content);
        }
        return;
      } catch {
        // File not found, try next path
      }
    }

    // SPA fallback: serve index.html for any unresolved route
    try {
      const indexPath = join(rootDir, 'index.html');
      const content = await readFile(indexPath);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': content.length,
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(content);
      }
    } catch {
      res.writeHead(404);
      res.end('Not Found');
    }
  };
}
