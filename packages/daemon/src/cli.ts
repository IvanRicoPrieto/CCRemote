import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, unlinkSync, appendFileSync, mkdirSync, createReadStream, statSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import qrcode from 'qrcode-terminal';
import { getDatabase, initializeDatabase, CONFIG_DIR, ensureConfigDir } from './db/database.js';
import { getOrCreateToken, regenerateToken, validateToken } from './auth/TokenAuth.js';
import { SessionManager } from './session/SessionManager.js';
import { WebSocketServerWrapper } from './server/WebSocketServer.js';
import { createStaticHandler } from './server/StaticFileServer.js';
import { validatePathInProject } from './server/fileHandlers.js';
import { getTailscaleCerts } from './server/TailscaleCerts.js';
import { connectToDaemon } from './client/DaemonClient.js';
import type { SessionsListMessage, SessionCreatedMessage, SessionKilledMessage, SessionInfo } from '@ccremote/shared';

const PID_FILE = join(CONFIG_DIR, 'daemon.pid');
const LOG_FILE = join(CONFIG_DIR, 'daemon.log');
const MIN_RESTART_INTERVAL_MS = 5000;
const MAX_RESTART_DELAY_MS = 60000;

const SYSTEMD_SERVICE_NAME = 'ccremote';
const SYSTEMD_SERVICE_DIR = join(process.env['HOME'] ?? '/tmp', '.config', 'systemd', 'user');
const SYSTEMD_SERVICE_FILE = join(SYSTEMD_SERVICE_DIR, `${SYSTEMD_SERVICE_NAME}.service`);

function getCompiledEntryPoint(): string {
  // bin/ccremote.js is next to src/, dist/ is compiled output
  const thisDir = typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
  // From src/cli.ts → ../bin/ccremote.js
  // From dist/cli.js → ../bin/ccremote.js
  return join(thisDir, '..', 'bin', 'ccremote.js');
}

function isSystemdInstalled(): boolean {
  return existsSync(SYSTEMD_SERVICE_FILE);
}

function isSystemdRunning(): boolean {
  if (!isSystemdInstalled()) return false;
  try {
    const result = spawnSync('systemctl', ['--user', 'is-active', SYSTEMD_SERVICE_NAME], {
      encoding: 'utf-8',
    });
    return result.stdout.trim() === 'active';
  } catch {
    return false;
  }
}

interface TailscaleInfo {
  ip: string;
  hostname: string;
}

function getTailscaleInfo(): TailscaleInfo | null {
  try {
    const ip = execSync('tailscale ip -4', { encoding: 'utf-8' }).trim();
    const statusJson = execSync('tailscale status --json', { encoding: 'utf-8' });
    const status = JSON.parse(statusJson);
    const hostname = status.Self?.DNSName?.replace(/\.$/, '') ?? '';
    return { ip, hostname };
  } catch {
    return null;
  }
}

function isDaemonRunning(): boolean {
  if (!existsSync(PID_FILE)) return false;
  const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    unlinkSync(PID_FILE);
    return false;
  }
}

function writePidFile(): void {
  ensureConfigDir();
  writeFileSync(PID_FILE, process.pid.toString());
}

function removePidFile(): void {
  if (existsSync(PID_FILE)) {
    unlinkSync(PID_FILE);
  }
}

function getPwaDistPath(): string {
  // When compiled: dist/cli.js → ../../pwa/dist
  // When running with tsx: src/cli.ts → ../pwa/dist
  const thisDir = typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
  const fromDist = join(thisDir, '../../pwa/dist');
  if (existsSync(fromDist)) return fromDist;
  const fromSrc = join(thisDir, '../pwa/dist');
  if (existsSync(fromSrc)) return fromSrc;
  return fromDist; // fallback
}

export function createCLI(): Command {
  const program = new Command();

  program
    .name('ccremote')
    .description('Remote control for Claude Code sessions')
    .version('0.1.0');

  // START command
  program
    .command('start')
    .description('Start the CCRemote daemon')
    .option('-p, --port <port>', 'Port to listen on', '9876')
    .option('-f, --foreground', 'Run in foreground (no daemonize)')
    .action(async (options) => {
      const port = parseInt(options.port, 10);

      if (options.foreground) {
        // Foreground mode — launched directly, by supervisor, or by systemd
        const tailscale = getTailscaleInfo();
        if (!tailscale) {
          console.error('Tailscale is not running or not connected.');
          console.error('Please run: sudo tailscale up');
          process.exit(1);
        }
        await startDaemon(port, tailscale);
      } else if (isSystemdInstalled()) {
        // systemd mode — use systemctl
        if (isSystemdRunning()) {
          console.log('CCRemote is already running (systemd).');
          return;
        }
        const result = spawnSync('systemctl', ['--user', 'start', SYSTEMD_SERVICE_NAME], { stdio: 'inherit' });
        if (result.status === 0) {
          console.log('CCRemote started via systemd.');
          console.log('  Status: systemctl --user status ccremote');
          console.log('  Logs:   journalctl --user -u ccremote -f');
        } else {
          console.error('Failed to start CCRemote via systemd.');
          process.exit(1);
        }
      } else {
        // Supervisor fallback — no systemd installed
        if (isDaemonRunning()) {
          console.error('Daemon is already running. Use "ccremote stop" first.');
          process.exit(1);
        }
        runSupervisor(port);
      }
    });

  // STOP command
  program
    .command('stop')
    .description('Stop the CCRemote daemon')
    .option('--kill-sessions', 'Kill all tmux sessions before stopping (by default sessions persist)')
    .action((options) => {
      if (isSystemdInstalled()) {
        const result = spawnSync('systemctl', ['--user', 'stop', SYSTEMD_SERVICE_NAME], { stdio: 'inherit' });
        if (result.status === 0) {
          console.log('CCRemote stopped (systemd). Sessions persist in tmux.');
        } else {
          console.error('Failed to stop CCRemote via systemd.');
        }
        return;
      }

      if (!isDaemonRunning()) {
        console.log('Daemon is not running.');
        return;
      }
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
      try {
        if (options.killSessions) {
          process.kill(pid, 'SIGUSR1');
          console.log('Daemon stopped (all sessions killed).');
        } else {
          process.kill(pid, 'SIGTERM');
          console.log('Daemon stopped (sessions persist in tmux).');
        }
      } catch (error) {
        console.error('Failed to stop daemon:', error);
      }
    });

  // STATUS command
  program
    .command('status')
    .description('Show daemon status and active sessions')
    .option('-p, --port <port>', 'Port', '9876')
    .action(async (options) => {
      const running = isSystemdInstalled() ? isSystemdRunning() : isDaemonRunning();
      if (!running) {
        console.log('Daemon is not running.');
        if (isSystemdInstalled()) {
          console.log('  Start with: ccremote start');
          console.log('  Logs:       journalctl --user -u ccremote --no-pager -n 20');
        }
        return;
      }

      const mode = isSystemdInstalled() ? 'systemd' : 'supervisor';
      const tailscale = getTailscaleInfo();
      console.log(`Daemon: running (${mode})`);
      if (tailscale) {
        console.log(`Tailscale IP: ${tailscale.ip}`);
        console.log(`Hostname: ${tailscale.hostname}`);
      }

      try {
        const port = parseInt(options.port, 10);
        const client = await connectToDaemon(port);
        const response = await client.sendAndWait<SessionsListMessage>(
          { type: 'get_sessions', payload: {} },
          'sessions_list'
        );
        client.close();

        const sessions = response.payload.sessions;
        if (sessions.length === 0) {
          console.log('\nNo active sessions.');
        } else {
          console.log(`\nActive sessions: ${sessions.length}`);
          for (const s of sessions) {
            console.log(`  ${s.id}  ${s.state.padEnd(12)}  ${s.projectName}  (${s.model})`);
          }
        }
      } catch {
        console.log('\nCould not connect to daemon to list sessions.');
      }
    });

  // TOKEN command
  program
    .command('token')
    .description('Show or regenerate the auth token')
    .option('-r, --regenerate', 'Generate a new token')
    .action((options) => {
      const db = getDatabase();
      initializeDatabase(db);
      if (options.regenerate) {
        const token = regenerateToken(db);
        console.log('New token generated:');
        console.log(token);
      } else {
        const token = getOrCreateToken(db);
        console.log('Auth token:');
        console.log(token);
      }
      db.close();
    });

  // QR command
  program
    .command('qr')
    .description('Show QR code for connecting from phone')
    .option('-p, --port <port>', 'Port', '9876')
    .action((options) => {
      const tailscale = getTailscaleInfo();
      if (!tailscale) {
        console.error('Tailscale is not running or not connected.');
        process.exit(1);
      }

      const db = getDatabase();
      initializeDatabase(db);
      const token = getOrCreateToken(db);
      db.close();

      const port = options.port;
      // Use HTTPS hostname if available, fallback to IP
      const protocol = tailscale.hostname ? 'https' : 'http';
      const host = tailscale.hostname || tailscale.ip;
      const url = `${protocol}://${host}:${port}?token=${token}`;

      console.log('Scan this QR code with your phone:\n');
      qrcode.generate(url, { small: true });
      console.log(`\nURL: ${url}`);
    });

  // NEW command
  program
    .command('new')
    .description('Create a new Claude Code or shell session')
    .option('-p, --project <path>', 'Project directory', process.cwd())
    .option('-m, --model <model>', 'Model to use')
    .option('--plan', 'Enable plan mode')
    .option('--shell', 'Create a plain shell session instead of Claude')
    .option('--port <port>', 'Daemon port', '9876')
    .action(async (options) => {
      try {
        const port = parseInt(options.port, 10);
        const sessionType = options.shell ? 'shell' : 'claude';
        const client = await connectToDaemon(port);
        const response = await client.sendAndWait<SessionCreatedMessage>(
          {
            type: 'create_session',
            payload: {
              projectPath: options.project,
              model: options.model,
              planMode: options.plan,
              sessionType,
            },
          },
          'session_created'
        );
        client.close();

        const session = response.payload.session;
        console.log(`Session created: ${session.id} (${session.sessionType})`);
        console.log(`  Project: ${session.projectName}`);
        if (session.sessionType !== 'shell') {
          console.log(`  Model: ${session.model}`);
        }
        console.log(`  State: ${session.state}`);
      } catch (error) {
        console.error(`Failed to create session: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  // LIST command
  program
    .command('list')
    .description('List active sessions')
    .option('--port <port>', 'Daemon port', '9876')
    .action(async (options) => {
      try {
        const port = parseInt(options.port, 10);
        const client = await connectToDaemon(port);
        const response = await client.sendAndWait<SessionsListMessage>(
          { type: 'get_sessions', payload: {} },
          'sessions_list'
        );
        client.close();

        const sessions = response.payload.sessions;
        if (sessions.length === 0) {
          console.log('No active sessions.');
          return;
        }

        console.log(`${'ID'.padEnd(14)} ${'State'.padEnd(14)} ${'Project'.padEnd(20)} Model`);
        console.log('-'.repeat(70));
        for (const s of sessions) {
          console.log(`${s.id.padEnd(14)} ${s.state.padEnd(14)} ${s.projectName.padEnd(20)} ${s.model}`);
        }
      } catch (error) {
        console.error(`Failed to list sessions: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  // ATTACH command
  program
    .command('attach <sessionId>')
    .description('Attach to a session via tmux (native terminal)')
    .option('--port <port>', 'Daemon port', '9876')
    .action(async (sessionId: string, options) => {
      try {
        // Verify the session exists by querying the daemon
        const port = parseInt(options.port, 10);
        const client = await connectToDaemon(port);
        const response = await client.sendAndWait<SessionsListMessage>(
          { type: 'get_sessions', payload: {} },
          'sessions_list'
        );
        client.close();

        const session = response.payload.sessions.find(
          (s: SessionInfo) => s.id === sessionId || s.tmuxSession === sessionId
        );
        if (!session) {
          console.error(`Session ${sessionId} not found.`);
          process.exit(1);
        }

        const tmuxName = session.tmuxSession;
        if (!tmuxName) {
          console.error('Session does not have a tmux session.');
          process.exit(1);
        }

        console.log(`Attaching to tmux session: ${tmuxName}`);
        console.log('Use Ctrl+B D to detach (session stays alive).\n');

        // Attach directly — user gets native tmux rendering
        const result = spawnSync('tmux', ['attach-session', '-t', tmuxName], {
          stdio: 'inherit',
        });

        if (result.status !== 0) {
          console.error('Failed to attach to tmux session. Is tmux installed?');
          process.exit(1);
        }

        console.log('Detached. Session still running.');
      } catch (error) {
        console.error(`Failed to attach: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  // KILL command
  program
    .command('kill <sessionId>')
    .description('Kill a session')
    .option('--port <port>', 'Daemon port', '9876')
    .action(async (sessionId: string, options) => {
      try {
        const port = parseInt(options.port, 10);
        const client = await connectToDaemon(port);
        const response = await client.sendAndWait<SessionKilledMessage>(
          { type: 'kill_session', payload: { sessionId } },
          'session_killed'
        );
        client.close();
        console.log(`Session ${response.payload.sessionId} killed.`);
      } catch (error) {
        console.error(`Failed to kill session: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  // INSTALL command
  program
    .command('install')
    .description('Install CCRemote as a systemd user service (auto-start, auto-restart)')
    .option('-p, --port <port>', 'Port to listen on', '9876')
    .action((options) => {
      const entryPoint = getCompiledEntryPoint();
      if (!existsSync(entryPoint)) {
        console.error(`Compiled entry point not found: ${entryPoint}`);
        console.error('Run "npm run build" first.');
        process.exit(1);
      }

      const nodePath = process.execPath;
      const port = options.port;
      const workDir = join(dirname(entryPoint), '..');

      const serviceContent = `[Unit]
Description=CCRemote - Remote control for Claude Code
After=network-online.target

[Service]
Type=simple
ExecStart=${nodePath} ${entryPoint} start -f -p ${port}
Restart=always
RestartSec=3
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=HOME=${process.env['HOME'] ?? ''}
WorkingDirectory=${workDir}

[Install]
WantedBy=default.target
`;

      mkdirSync(SYSTEMD_SERVICE_DIR, { recursive: true });
      writeFileSync(SYSTEMD_SERVICE_FILE, serviceContent);
      console.log(`Service file written: ${SYSTEMD_SERVICE_FILE}`);

      // Stop existing daemon if running via PID file
      if (isDaemonRunning()) {
        const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
        try {
          process.kill(pid, 'SIGTERM');
          console.log('Stopped existing daemon (PID file).');
        } catch { /* already dead */ }
      }

      const reload = spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' });
      if (reload.status !== 0) {
        console.error('Failed to reload systemd.');
        process.exit(1);
      }

      const enable = spawnSync('systemctl', ['--user', 'enable', '--now', SYSTEMD_SERVICE_NAME], { stdio: 'inherit' });
      if (enable.status !== 0) {
        console.error('Failed to enable/start service.');
        process.exit(1);
      }

      console.log('\nCCRemote installed as systemd user service.');
      console.log('  Status:  systemctl --user status ccremote');
      console.log('  Logs:    journalctl --user -u ccremote -f');
      console.log('  Stop:    ccremote stop');
      console.log('  Remove:  ccremote uninstall');
    });

  // UNINSTALL command
  program
    .command('uninstall')
    .description('Remove CCRemote systemd user service')
    .action(() => {
      if (!isSystemdInstalled()) {
        console.log('CCRemote is not installed as a systemd service.');
        return;
      }

      spawnSync('systemctl', ['--user', 'disable', '--now', SYSTEMD_SERVICE_NAME], { stdio: 'inherit' });
      unlinkSync(SYSTEMD_SERVICE_FILE);
      spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' });

      console.log('CCRemote systemd service removed.');
    });

  return program;
}

function logToFile(message: string): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${message}\n`;
  try {
    appendFileSync(LOG_FILE, line);
  } catch {
    // Can't write log — not critical
  }
}

function runSupervisor(port: number): void {
  ensureConfigDir();

  let consecutiveQuickDeaths = 0;
  let stopping = false;
  let child: ChildProcess | null = null;

  const spawnDaemon = (): void => {
    const startTime = Date.now();

    logToFile(`Supervisor: starting daemon on port ${port} (pid=${process.pid})`);

    child = spawn(process.execPath, [...process.execArgv, process.argv[1]!, 'start', '-f', '-p', port.toString()], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    child.stdout?.on('data', (data: Buffer) => {
      process.stdout.write(data);
      logToFile(data.toString().trimEnd());
    });

    child.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(data);
      logToFile(`[stderr] ${data.toString().trimEnd()}`);
    });

    child.on('exit', (code, signal) => {
      if (stopping) {
        logToFile(`Supervisor: daemon stopped (code=${code}, signal=${signal})`);
        removePidFile();
        process.exit(0);
      }

      const uptime = Date.now() - startTime;
      logToFile(`Supervisor: daemon exited (code=${code}, signal=${signal}, uptime=${uptime}ms)`);

      if (uptime < MIN_RESTART_INTERVAL_MS) {
        consecutiveQuickDeaths++;
      } else {
        consecutiveQuickDeaths = 0;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, ... capped at MAX_RESTART_DELAY_MS
      const delay = Math.min(1000 * Math.pow(2, consecutiveQuickDeaths), MAX_RESTART_DELAY_MS);
      logToFile(`Supervisor: restarting in ${delay}ms (quick deaths: ${consecutiveQuickDeaths})`);

      setTimeout(spawnDaemon, delay);
    });
  };

  // Supervisor PID file — so `ccremote stop` can kill us
  writePidFile();

  const stopChild = (sig: NodeJS.Signals) => {
    stopping = true;
    if (child) {
      child.kill(sig);
    } else {
      removePidFile();
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => stopChild('SIGTERM'));
  process.on('SIGINT', () => stopChild('SIGINT'));
  process.on('SIGUSR1', () => {
    stopping = true;
    if (child) {
      child.kill('SIGUSR1');
    } else {
      removePidFile();
      process.exit(0);
    }
  });

  // Detach from terminal
  process.stdin.unref?.();

  spawnDaemon();

  console.log(`CCRemote supervisor started (pid=${process.pid}), daemon will auto-restart on crash.`);
  console.log(`Logs: ${LOG_FILE}`);
}

async function startDaemon(port: number, tailscale: TailscaleInfo): Promise<void> {
  // Check tmux dependency
  try {
    execSync('tmux -V', { stdio: 'ignore' });
  } catch {
    console.error('tmux is required but not installed.');
    console.error('Install it with: sudo apt install tmux');
    process.exit(1);
  }

  // Protect against unhandled errors crashing the daemon.
  // If errors repeat too fast (>10 in 5s), let the process die so the supervisor restarts clean.
  let errorCount = 0;
  let errorWindowStart = Date.now();
  const MAX_ERRORS_PER_WINDOW = 10;
  const ERROR_WINDOW_MS = 5000;

  const handleFatalError = (label: string, err: unknown) => {
    const now = Date.now();
    if (now - errorWindowStart > ERROR_WINDOW_MS) {
      errorCount = 0;
      errorWindowStart = now;
    }
    errorCount++;
    console.error(`[CCRemote] ${label}:`, err);
    if (errorCount >= MAX_ERRORS_PER_WINDOW) {
      console.error(`[CCRemote] Too many errors (${errorCount} in ${ERROR_WINDOW_MS}ms), exiting for clean restart.`);
      process.exit(1);
    }
  };

  process.on('uncaughtException', (error) => handleFatalError('Uncaught exception', error));
  process.on('unhandledRejection', (reason) => handleFatalError('Unhandled rejection', reason));

  console.log('Starting CCRemote daemon...');

  const db = getDatabase();
  initializeDatabase(db);

  const token = getOrCreateToken(db);
  const sessionManager = new SessionManager(db);

  // Rediscover sessions from a previous daemon run
  const reconnected = sessionManager.rediscoverSessions();
  if (reconnected > 0) {
    console.log(`Reconnected to ${reconnected} existing session(s).`);
  }

  // Resolve PWA dist path
  const pwaDistPath = getPwaDistPath();
  const pwaAvailable = existsSync(join(pwaDistPath, 'index.html'));

  if (pwaAvailable) {
    console.log(`Serving PWA from: ${pwaDistPath}`);
  } else {
    console.log(`PWA not built (looked in ${pwaDistPath}). Run "npm run build" first for web UI.`);
  }

  // Create static file handler
  const staticHandler = pwaAvailable ? createStaticHandler(pwaDistPath) : null;
  const startTime = Date.now();

  const requestHandler = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
    // Health endpoint
    if (req.url === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
      const body = JSON.stringify({
        status: 'ok',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        sessions: sessionManager.getAllSessionInfos().length,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
      return;
    }

    // File download endpoint
    if (req.url?.startsWith('/download?') && req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
      const dlToken = url.searchParams.get('token');
      const sessionId = url.searchParams.get('sessionId');
      const filePath = url.searchParams.get('path');

      if (!dlToken || !validateToken(db, dlToken)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No autorizado' }));
        return;
      }

      if (!sessionId || !filePath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Faltan parámetros: sessionId, path' }));
        return;
      }

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Sesión no encontrada' }));
        return;
      }

      const projectPath = session.getInfo().projectPath;
      const resolved = validatePathInProject(projectPath, filePath);
      if (!resolved) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Ruta fuera del proyecto' }));
        return;
      }

      try {
        const fileStat = statSync(resolved);
        if (fileStat.isDirectory()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No se puede descargar una carpeta' }));
          return;
        }
        const fileName = basename(resolved);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
          'Content-Length': fileStat.size,
        });
        createReadStream(resolved).pipe(res);
      } catch {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Archivo no encontrado' }));
      }
      return;
    }

    if (staticHandler) {
      staticHandler(req, res);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('CCRemote daemon running. PWA not built.');
    }
  };

  // Try to get Tailscale HTTPS certs
  const certs = tailscale.hostname ? getTailscaleCerts(tailscale.hostname) : null;
  const useHttps = certs !== null;

  // Create HTTP or HTTPS server
  const httpServer = useHttps
    ? createHttpsServer({ cert: certs.cert, key: certs.key }, requestHandler)
    : createHttpServer(requestHandler);

  // Attach WebSocket to the HTTP server
  const wsServer = new WebSocketServerWrapper(httpServer, db, sessionManager);

  // Listen on both Tailscale IP and localhost
  httpServer.listen(port, '0.0.0.0', () => {
    const protocol = useHttps ? 'https' : 'http';
    const wsProtocol = useHttps ? 'wss' : 'ws';
    const host = tailscale.hostname || tailscale.ip;

    console.log(`Daemon started on ${protocol}://${host}:${port}`);
    console.log(`WebSocket: ${wsProtocol}://${host}:${port}`);
    console.log(`Auth token: ${token}`);

    if (pwaAvailable) {
      const pwaUrl = `${protocol}://${host}:${port}?token=${token}`;
      console.log(`\nOpen on your phone: ${pwaUrl}`);
      console.log('\nQR Code:');
      qrcode.generate(pwaUrl, { small: true });
    }
  });

  const shutdown = () => {
    console.log('\nShutting down (sessions will persist in tmux)...');
    sessionManager.disconnectAll();
    wsServer.close();
    httpServer.close();
    db.close();
    process.exit(0);
  };

  // SIGUSR1 = kill all sessions then shutdown
  const killAndShutdown = () => {
    console.log('\nKilling all sessions and shutting down...');
    sessionManager.killAll();
    wsServer.close();
    httpServer.close();
    db.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('SIGUSR1', killAndShutdown);

  await new Promise(() => {});
}
