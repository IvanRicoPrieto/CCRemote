import { useState, useEffect, useRef } from 'react';
import { Key, Loader2 } from 'lucide-react';

interface ConnectionSetupProps {
  onConnect: (url: string, token: string) => void;
  isConnecting: boolean;
  error: string | null;
}

const STORAGE_KEY = 'ccremote_connection';

interface SavedConnection {
  url: string;
  token: string;
}

function detectWebSocketUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}

function isServedFromDaemon(): boolean {
  // If we're served from the daemon, the host won't be localhost:5173 (Vite dev)
  const port = window.location.port;
  return port !== '5173' && port !== '5174';
}

export function ConnectionSetup({ onConnect, isConnecting, error }: ConnectionSetupProps) {
  const [token, setToken] = useState('');
  const [url, setUrl] = useState('');
  const [showUrlField, setShowUrlField] = useState(false);
  const autoConnectAttempted = useRef(false);

  // On mount: detect URL, parse token from query params, load saved connection
  useEffect(() => {
    if (autoConnectAttempted.current) return;
    autoConnectAttempted.current = true;

    const params = new URLSearchParams(window.location.search);
    const paramToken = params.get('token');

    // Clean URL params
    if (paramToken) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Determine WebSocket URL
    let wsUrl: string;
    if (isServedFromDaemon()) {
      wsUrl = detectWebSocketUrl();
    } else {
      // Dev mode: try to load saved URL
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as SavedConnection;
          wsUrl = parsed.url;
        } catch {
          wsUrl = '';
        }
      } else {
        wsUrl = '';
      }
      setShowUrlField(true);
    }
    setUrl(wsUrl);

    // Determine token
    const savedToken = paramToken ?? (() => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          return (JSON.parse(saved) as SavedConnection).token;
        } catch {
          return '';
        }
      }
      return '';
    })();
    setToken(savedToken);

    // Auto-connect if we have both
    if (wsUrl && savedToken) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: wsUrl, token: savedToken }));
      onConnect(wsUrl, savedToken);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const wsUrl = showUrlField ? url : detectWebSocketUrl();
    if (wsUrl && token) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: wsUrl, token }));
      onConnect(wsUrl, token);
    }
  };

  return (
    <div className="min-h-screen bg-surface-dark flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-400 mb-2">CCRemote</h1>
          <p className="text-slate-400">Control remoto para Claude Code</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {showUrlField && (
            <div>
              <label className="block text-sm text-slate-300 mb-2">
                URL del servidor
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="ws://100.x.x.x:9876"
                className="w-full bg-surface border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-300 mb-2">
              <Key size={14} className="inline mr-1.5" />
              Token de autenticación
            </label>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Pega el token aquí"
              className="w-full bg-surface border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono text-sm"
            />
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!token || (showUrlField && !url) || isConnecting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isConnecting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Conectando...</span>
              </>
            ) : (
              <span>Conectar</span>
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-500">
          <p>En tu PC, ejecuta:</p>
          <code className="block mt-2 bg-surface px-3 py-2 rounded text-slate-300">
            ccremote qr
          </code>
          <p className="mt-2">para obtener el código QR de conexión</p>
        </div>
      </div>
    </div>
  );
}
