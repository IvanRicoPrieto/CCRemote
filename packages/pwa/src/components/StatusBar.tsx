import { Wifi, WifiOff, AlertCircle } from 'lucide-react';

interface StatusBarProps {
  connected: boolean;
  authenticated: boolean;
  error: string | null;
  attentionCount: number;
}

export function StatusBar({ connected, authenticated, error, attentionCount }: StatusBarProps) {
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
              <Wifi size={16} className="text-green-500" />
              <span className="text-xs text-green-500">Conectado</span>
            </>
          ) : (
            <>
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
