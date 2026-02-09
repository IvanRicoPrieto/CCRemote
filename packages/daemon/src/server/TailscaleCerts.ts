import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

export interface TailscaleCertPair {
  cert: Buffer;
  key: Buffer;
}

const CERT_DIRS = [
  join(homedir(), '.local/share/tailscale/certs'),
  '/var/lib/tailscale/certs',
];

function findCerts(hostname: string): TailscaleCertPair | null {
  // Strip trailing dot from DNS name
  const name = hostname.replace(/\.$/, '');

  for (const dir of CERT_DIRS) {
    const certPath = join(dir, `${name}.crt`);
    const keyPath = join(dir, `${name}.key`);

    if (existsSync(certPath) && existsSync(keyPath)) {
      try {
        return {
          cert: readFileSync(certPath),
          key: readFileSync(keyPath),
        };
      } catch {
        // Permission denied or other read error, try next
      }
    }
  }
  return null;
}

function generateCerts(hostname: string): TailscaleCertPair | null {
  const name = hostname.replace(/\.$/, '');
  try {
    execSync(`tailscale cert ${name}`, { stdio: 'pipe', timeout: 30000 });
    return findCerts(hostname);
  } catch {
    return null;
  }
}

export function getTailscaleCerts(hostname: string): TailscaleCertPair | null {
  const existing = findCerts(hostname);
  if (existing) return existing;
  return generateCerts(hostname);
}
