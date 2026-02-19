import { Wifi, WifiOff, AlertCircle, Loader2 } from 'lucide-react';

interface StatusBarProps {
  connected: boolean;
  authenticated: boolean;
  reconnecting: boolean;
  error: string | null;
  attentionCount: number;
}

export function StatusBar({ connected, authenticated, reconnecting, error, attentionCount }: StatusBarProps) {
  return (
    <header className="bg-surface px-4 py-3 flex items-center justify-between safe-top">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-indigo-400">CCRemote</h1>
      </div>

      <div className="flex items-center gap-3">
        {attentionCount > 0 && (
          <div className="flex items-center gap-1 bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full text-sm">
            <AlertCircle size={14} />
            <span>{attentionCount}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {connected && authenticated ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              <Wifi size={16} className="text-green-500" />
              <span className="text-xs text-green-500">Conectado</span>
            </>
          ) : reconnecting ? (
            <>
              <Loader2 size={16} className="text-amber-400 animate-spin" />
              <span className="text-xs text-amber-400">Reconectando...</span>
            </>
          ) : (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <WifiOff size={16} className="text-red-500" />
              <span className="text-xs text-red-500">
                {error ?? 'Desconectado'}
              </span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
