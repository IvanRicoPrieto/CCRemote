import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync, spawnSync } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import qrcode from 'qrcode-terminal';
import { getDatabase, initializeDatabase, CONFIG_DIR, ensureConfigDir } from './db/database.js';
import { getOrCreateToken, regenerateToken } from './auth/TokenAuth.js';
import { SessionManager } from './session/SessionManager.js';
import { WebSocketServerWrapper } from './server/WebSocketServer.js';
import { createStaticHandler } from './server/StaticFileServer.js';
import { getTailscaleCerts } from './server/TailscaleCerts.js';
import { connectToDaemon } from './client/DaemonClient.js';
import type { SessionsListMessage, SessionCreatedMessage, SessionKilledMessage, SessionInfo } from '@ccremote/shared';

const PID_FILE = join(CONFIG_DIR, 'daemon.pid');

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
      if (isDaemonRunning()) {
        console.error('Daemon is already running. Use "ccremote stop" first.');
        process.exit(1);
      }

      const port = parseInt(options.port, 10);
      const tailscale = getTailscaleInfo();

      if (!tailscale) {
        console.error('Tailscale is not running or not connected.');
        console.error('Please run: sudo tailscale up');
        process.exit(1);
      }

      if (options.foreground) {
        await startDaemon(port, tailscale);
      } else {
        const child = spawn(process.argv[0]!, [process.argv[1]!, 'start', '-f', '-p', port.toString()], {
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: process.env,
        });
        child.unref();

        console.log(`CCRemote daemon starting on port ${port}...`);
        console.log(`Tailscale IP: ${tailscale.ip}`);
        console.log(`Hostname: ${tailscale.hostname}`);
        console.log('Run "ccremote qr" to get a QR code for easy setup');
      }
    });

  // STOP command
  program
    .command('stop')
    .description('Stop the CCRemote daemon')
    .action(() => {
      if (!isDaemonRunning()) {
        console.log('Daemon is not running.');
        return;
      }
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
      try {
        process.kill(pid, 'SIGTERM');
        console.log('Daemon stopped.');
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
      if (!isDaemonRunning()) {
        console.log('Daemon is not running.');
        return;
      }

      const tailscale = getTailscaleInfo();
      console.log('Daemon: running');
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
    .description('Create a new Claude Code session')
    .option('-p, --project <path>', 'Project directory', process.cwd())
    .option('-m, --model <model>', 'Model to use')
    .option('--plan', 'Enable plan mode')
    .option('--port <port>', 'Daemon port', '9876')
    .action(async (options) => {
      try {
        const port = parseInt(options.port, 10);
        const client = await connectToDaemon(port);
        const response = await client.sendAndWait<SessionCreatedMessage>(
          {
            type: 'create_session',
            payload: {
              projectPath: options.project,
              model: options.model,
              planMode: options.plan,
            },
          },
          'session_created'
        );
        client.close();

        const session = response.payload.session;
        console.log(`Session created: ${session.id}`);
        console.log(`  Project: ${session.projectName}`);
        console.log(`  Model: ${session.model}`);
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

  return program;
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

  console.log('Starting CCRemote daemon...');

  const db = getDatabase();
  initializeDatabase(db);

  const token = getOrCreateToken(db);
  const sessionManager = new SessionManager();

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

  // Try to get Tailscale HTTPS certs
  const certs = tailscale.hostname ? getTailscaleCerts(tailscale.hostname) : null;
  const useHttps = certs !== null;

  // Create HTTP or HTTPS server
  const httpServer = useHttps
    ? createHttpsServer({ cert: certs.cert, key: certs.key }, (req, res) => {
        if (staticHandler) {
          staticHandler(req, res);
        } else {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('CCRemote daemon running. PWA not built.');
        }
      })
    : createHttpServer((req, res) => {
        if (staticHandler) {
          staticHandler(req, res);
        } else {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('CCRemote daemon running. PWA not built.');
        }
      });

  // Attach WebSocket to the HTTP server
  const wsServer = new WebSocketServerWrapper(httpServer, db, sessionManager);

  // Listen on both Tailscale IP and localhost
  httpServer.listen(port, '0.0.0.0', () => {
    writePidFile();

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
    console.log('\nShutting down...');
    sessionManager.killAll();
    wsServer.close();
    httpServer.close();
    db.close();
    removePidFile();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await new Promise(() => {});
}
