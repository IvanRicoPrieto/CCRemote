import { useState } from 'react';
import type { SessionInfo } from '@ccremote/shared';
import { useWebSocket } from './hooks/useWebSocket.ts';
import { useSessions } from './hooks/useSessions.ts';
import { ConnectionSetup } from './components/ConnectionSetup.tsx';
import { StatusBar } from './components/StatusBar.tsx';
import { SessionList } from './components/SessionList.tsx';
import { SessionView } from './components/SessionView.tsx';
import { NewSessionDialog } from './components/NewSessionDialog.tsx';

function App() {
  const [connectionConfig, setConnectionConfig] = useState<{ url: string; token: string } | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const [showNewSession, setShowNewSession] = useState(false);

  const {
    connected,
    authenticated,
    sessions,
    error,
    send,
    outputScreens,
    clearOutputScreen,
    directoryListing,
  } = useWebSocket({
    url: connectionConfig?.url ?? '',
    token: connectionConfig?.token ?? '',
  });

  const { activeSessions, needsAttention } = useSessions(sessions);

  const handleConnect = (url: string, token: string) => {
    setConnectionConfig({ url, token });
  };

  const handleSelectSession = (session: SessionInfo) => {
    clearOutputScreen(session.id);
    setSelectedSession(session);
  };

  const handleInput = (data: string) => {
    if (!selectedSession) return;
    send({ type: 'send_key', payload: { sessionId: selectedSession.id, key: data } });
  };

  const handleResize = (cols: number, rows: number) => {
    if (!selectedSession) return;
    send({ type: 'resize_terminal', payload: { sessionId: selectedSession.id, cols, rows } });
  };

  const handleCreateSession = (projectPath: string, model: string) => {
    send({ type: 'create_session', payload: { projectPath, model } });
    setShowNewSession(false);
  };

  const handleKillSession = (sessionId: string) => {
    send({ type: 'kill_session', payload: { sessionId } });
    if (selectedSession?.id === sessionId) {
      setSelectedSession(null);
    }
  };

  // Show connection setup if not connected
  if (!connectionConfig || (!connected && !authenticated)) {
    return (
      <ConnectionSetup
        onConnect={handleConnect}
        isConnecting={!!connectionConfig && !connected}
        error={error}
      />
    );
  }

  // Update selected session from sessions list (to get latest state)
  const currentSession = selectedSession
    ? sessions.find((s) => s.id === selectedSession.id) ?? selectedSession
    : null;

  // Session detail view
  if (currentSession) {
    const sessionScreen = outputScreens.get(currentSession.id) ?? '';

    return (
      <div className="h-screen h-[100dvh] flex flex-col bg-surface-dark">
        <SessionView
          session={currentSession}
          screen={sessionScreen}
          onBack={() => setSelectedSession(null)}
          onResize={handleResize}
          onInput={handleInput}
        />
      </div>
    );
  }

  // Session list view
  return (
    <div className="h-screen h-[100dvh] flex flex-col bg-surface-dark">
      <StatusBar
        connected={connected}
        authenticated={authenticated}
        error={error}
        attentionCount={needsAttention.length}
      />
      <main className="flex-1 overflow-y-auto">
        <SessionList
          sessions={activeSessions}
          onSelectSession={handleSelectSession}
          onCreateSession={() => setShowNewSession(true)}
          onKillSession={handleKillSession}
        />
      </main>
      {showNewSession && (
        <NewSessionDialog
          onClose={() => setShowNewSession(false)}
          onCreate={handleCreateSession}
          send={send}
          directoryListing={directoryListing}
        />
      )}
    </div>
  );
}

export default App;
