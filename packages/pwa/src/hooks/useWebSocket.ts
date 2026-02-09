import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  ClientMessage,
  ServerMessage,
  SessionInfo,
  Capabilities,
  InputRequiredMessage,
} from '@ccremote/shared';

interface UseWebSocketOptions {
  url: string;
  token: string;
  onInputRequired?: (payload: InputRequiredMessage['payload']) => void;
}

export interface DirectoryListing {
  path: string;
  directories: string[];
  error?: string;
}

interface UseWebSocketReturn {
  connected: boolean;
  authenticated: boolean;
  sessions: SessionInfo[];
  capabilities: Capabilities | null;
  error: string | null;
  send: (message: ClientMessage) => void;
  outputScreens: Map<string, string>;
  clearOutputScreen: (sessionId: string) => void;
  directoryListing: DirectoryListing | null;
}

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

export function useWebSocket({
  url,
  token,
  onInputRequired,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outputScreens, setOutputScreens] = useState<Map<string, string>>(new Map());
  const [directoryListing, setDirectoryListing] = useState<DirectoryListing | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        reconnectAttemptRef.current = 0;
        // Send auth immediately
        ws.send(JSON.stringify({ type: 'auth', payload: { token } }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage;
          handleMessage(message);
        } catch {
          console.error('Failed to parse message:', event.data);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setAuthenticated(false);
        wsRef.current = null;
        scheduleReconnect();
      };

      ws.onerror = () => {
        setError('Connection error');
      };
    } catch (err) {
      setError('Failed to connect');
      scheduleReconnect();
    }
  }, [url, token]);

  const scheduleReconnect = useCallback(() => {
    const delay = RECONNECT_DELAYS[Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1)];
    reconnectAttemptRef.current++;

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'auth_result':
        setAuthenticated(message.payload.success);
        if (!message.payload.success) {
          setError('Authentication failed');
        }
        break;

      case 'capabilities':
        setCapabilities(message.payload);
        break;

      case 'sessions_list':
        setSessions(message.payload.sessions);
        break;

      case 'session_created':
        setSessions((prev) => [...prev, message.payload.session]);
        break;

      case 'session_updated':
        setSessions((prev) =>
          prev.map((s) =>
            s.id === message.payload.session.id ? message.payload.session : s
          )
        );
        break;

      case 'session_killed':
        setSessions((prev) => prev.filter((s) => s.id !== message.payload.sessionId));
        setOutputScreens((prev) => {
          const next = new Map(prev);
          next.delete(message.payload.sessionId);
          return next;
        });
        break;

      case 'input_required':
        onInputRequired?.(message.payload);
        break;

      case 'output_update':
        setOutputScreens((prev) => {
          const next = new Map(prev);
          next.set(message.payload.sessionId, message.payload.content);
          return next;
        });
        break;

      case 'directory_listing':
        setDirectoryListing(message.payload);
        break;

      case 'context_limit':
        // Handle context limit notification
        setSessions((prev) =>
          prev.map((s) =>
            s.id === message.payload.sessionId ? { ...s, state: 'context_limit' as const } : s
          )
        );
        break;

      case 'error':
        setError(message.payload.message);
        break;

      case 'pong':
        // Keep-alive response, nothing to do
        break;
    }
  }, [onInputRequired]);

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const clearOutputScreen = useCallback((sessionId: string) => {
    setOutputScreens((prev) => {
      const next = new Map(prev);
      next.delete(sessionId);
      return next;
    });
  }, []);

  // Setup ping interval
  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        send({ type: 'ping', payload: {} });
      }
    }, 30000);

    return () => clearInterval(pingInterval);
  }, [send]);

  // Initial connection
  useEffect(() => {
    if (url && token) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [url, token, connect]);

  return {
    connected,
    authenticated,
    sessions,
    capabilities,
    error,
    send,
    outputScreens,
    clearOutputScreen,
    directoryListing,
  };
}
