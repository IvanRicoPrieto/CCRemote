import { useMemo } from 'react';
import type { SessionInfo, SessionState } from '@ccremote/shared';

interface UseSessionsReturn {
  activeSessions: SessionInfo[];
  needsAttention: SessionInfo[];
  getSessionById: (id: string) => SessionInfo | undefined;
}

const ATTENTION_STATES: SessionState[] = ['awaiting_input', 'awaiting_confirmation', 'context_limit'];

export function useSessions(sessions: SessionInfo[]): UseSessionsReturn {
  const activeSessions = useMemo(
    () => sessions.filter((s) => s.state !== 'dead'),
    [sessions]
  );

  const needsAttention = useMemo(
    () => sessions.filter((s) => ATTENTION_STATES.includes(s.state)),
    [sessions]
  );

  const getSessionById = useMemo(
    () => (id: string) => sessions.find((s) => s.id === id),
    [sessions]
  );

  return {
    activeSessions,
    needsAttention,
    getSessionById,
  };
}
