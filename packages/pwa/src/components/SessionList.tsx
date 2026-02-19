import { Folder, Terminal, Clock, AlertCircle, Loader2, CheckCircle2, Plus, Trash2, Hash, RefreshCw } from 'lucide-react';
import { useState, useRef, useCallback } from 'react';
import type { SessionInfo, SessionState } from '@ccremote/shared';

interface SessionListProps {
  sessions: SessionInfo[];
  onSelectSession: (session: SessionInfo) => void;
  onCreateSession?: () => void;
  onKillSession?: (sessionId: string) => void;
  onRefresh?: () => void;
}

const stateConfig: Record<SessionState, { label: string; color: string; icon: React.ReactNode }> = {
  starting: { label: 'Iniciando', color: 'text-blue-400', icon: <Loader2 size={14} className="animate-spin" /> },
  idle: { label: 'Esperando', color: 'text-slate-400', icon: <CheckCircle2 size={14} /> },
  working: { label: 'Trabajando', color: 'text-indigo-400', icon: <Loader2 size={14} className="animate-spin" /> },
  awaiting_input: { label: 'Necesita input', color: 'text-amber-400', icon: <AlertCircle size={14} /> },
  awaiting_confirmation: { label: 'Confirmar', color: 'text-amber-400', icon: <AlertCircle size={14} /> },
  context_limit: { label: 'Contexto lleno', color: 'text-red-400', icon: <AlertCircle size={14} /> },
  error: { label: 'Error', color: 'text-red-500', icon: <AlertCircle size={14} /> },
  dead: { label: 'Terminada', color: 'text-slate-500', icon: <CheckCircle2 size={14} /> },
};

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'ahora';
  if (diffMins < 60) return `hace ${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;
  return `hace ${Math.floor(diffHours / 24)}d`;
}

const PULL_THRESHOLD = 80;

export function SessionList({ sessions, onSelectSession, onCreateSession, onKillSession, onRefresh }: SessionListProps) {
  const [confirmKill, setConfirmKill] = useState<string | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isPulling = useRef(false);

  const handleKill = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (confirmKill === sessionId) {
      onKillSession?.(sessionId);
      setConfirmKill(null);
    } else {
      setConfirmKill(sessionId);
      setTimeout(() => setConfirmKill((prev) => prev === sessionId ? null : prev), 3000);
    }
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (scrollContainerRef.current && scrollContainerRef.current.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || isRefreshing) return;
    const distance = e.touches[0].clientY - touchStartY.current;
    if (distance > 0 && scrollContainerRef.current && scrollContainerRef.current.scrollTop <= 0) {
      setPullDistance(Math.min(distance * 0.5, 120));
    } else {
      isPulling.current = false;
      setPullDistance(0);
    }
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(() => {
    if (!isPulling.current) return;
    isPulling.current = false;
    if (pullDistance >= PULL_THRESHOLD && onRefresh) {
      setIsRefreshing(true);
      setPullDistance(50);
      onRefresh();
      setTimeout(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      }, 800);
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, onRefresh]);

  return (
    <div
      ref={scrollContainerRef}
      className="h-full overflow-y-auto"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {pullDistance > 0 && (
        <div
          className="flex items-center justify-center overflow-hidden transition-[height] duration-150"
          style={{ height: `${pullDistance}px` }}
        >
          <RefreshCw
            size={20}
            className={`text-indigo-400 transition-transform ${isRefreshing ? 'animate-spin' : ''}`}
            style={{ transform: `rotate(${Math.min(pullDistance / PULL_THRESHOLD, 1) * 360}deg)` }}
          />
          {!isRefreshing && pullDistance >= PULL_THRESHOLD && (
            <span className="ml-2 text-xs text-indigo-400">Soltar para refrescar</span>
          )}
        </div>
      )}

      <div className="space-y-3 p-4">
        {sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <Folder size={48} className="mb-4 opacity-50" />
            <p>No hay sesiones activas</p>
          </div>
        )}

        {sessions.map((session) => {
          const config = stateConfig[session.state];
          const needsAttention = session.state === 'awaiting_input' ||
                                 session.state === 'awaiting_confirmation' ||
                                 session.state === 'context_limit';

          return (
            <div key={session.id} className="flex items-stretch gap-2">
              <button
                onClick={() => onSelectSession(session)}
                className={`flex-1 min-w-0 text-left bg-surface rounded-lg p-4 transition-all active:scale-[0.98] ${
                  needsAttention ? 'ring-2 ring-amber-400/50' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {session.sessionType === 'shell' ? (
                        <Terminal size={16} className="text-emerald-400 flex-shrink-0" />
                      ) : (
                        <Folder size={16} className="text-indigo-400 flex-shrink-0" />
                      )}
                      <h3 className="font-medium truncate">{session.projectName}</h3>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="flex items-center gap-1 text-xs text-slate-500 font-mono">
                        <Hash size={10} />
                        {session.id}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{session.projectPath}</p>
                  </div>

                  <div className={`flex items-center gap-1.5 ${config.color} text-sm flex-shrink-0 ml-2`}>
                    {config.icon}
                    <span>{config.label}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                  <span className="bg-slate-700/50 px-2 py-0.5 rounded">
                    {session.sessionType === 'shell' ? 'Shell' : session.model}
                  </span>
                  <div className="flex items-center gap-1">
                    <Clock size={12} />
                    <span>{formatTimeAgo(session.lastActivity)}</span>
                  </div>
                </div>

                {session.planMode && (
                  <span className="inline-block mt-2 text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded">
                    Plan Mode
                  </span>
                )}
              </button>

              <button
                onClick={(e) => handleKill(e, session.id)}
                className={`flex items-center justify-center w-12 rounded-lg transition-colors ${
                  confirmKill === session.id
                    ? 'bg-red-600 text-white'
                    : 'bg-surface text-slate-500 hover:text-red-400'
                }`}
              >
                <Trash2 size={18} />
              </button>
            </div>
          );
        })}

        {onCreateSession && (
          <button
            onClick={onCreateSession}
            className="w-full flex items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed border-slate-600/50 text-slate-400 hover:border-indigo-500/50 hover:text-indigo-400 transition-colors active:scale-[0.98]"
          >
            <Plus size={20} />
            <span className="font-medium">Nueva sesión</span>
          </button>
        )}
      </div>
    </div>
  );
}
