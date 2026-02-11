import type { SessionInfo, SessionType, InputType, Capabilities } from './types.js';

// === Client Messages (PWA → Daemon) ===

export interface AuthMessage {
  type: 'auth';
  payload: { token: string };
}

export interface SendInputMessage {
  type: 'send_input';
  payload: { sessionId: string; input: string };
}

export interface SendCommandMessage {
  type: 'send_command';
  payload: { sessionId: string; command: string };
}

export interface CreateSessionMessage {
  type: 'create_session';
  payload: { projectPath: string; model?: string; planMode?: boolean; sessionType?: SessionType };
}

export interface KillSessionMessage {
  type: 'kill_session';
  payload: { sessionId: string };
}

export interface RestartSessionMessage {
  type: 'restart_session';
  payload: { sessionId: string; withSummary: boolean };
}

export interface ChangeModelMessage {
  type: 'change_model';
  payload: { sessionId: string; model: string };
}

export interface ToggleModeMessage {
  type: 'toggle_mode';
  payload: { sessionId: string; mode: string; enabled: boolean };
}

export interface GetSessionsMessage {
  type: 'get_sessions';
  payload: Record<string, never>;
}

export interface GetOutputMessage {
  type: 'get_output';
  payload: { sessionId: string; lines?: number };
}

export interface SendKeyMessage {
  type: 'send_key';
  payload: { sessionId: string; key: string };
}

export interface ResizeTerminalMessage {
  type: 'resize_terminal';
  payload: { sessionId: string; cols: number; rows: number };
}

export interface BrowseDirectoryMessage {
  type: 'browse_directory';
  payload: { path: string };
}

export interface ScrollMessage {
  type: 'scroll';
  payload: { sessionId: string };
}

export interface PingMessage {
  type: 'ping';
  payload: Record<string, never>;
}

export type ClientMessage =
  | AuthMessage
  | SendInputMessage
  | SendCommandMessage
  | CreateSessionMessage
  | KillSessionMessage
  | RestartSessionMessage
  | ChangeModelMessage
  | ToggleModeMessage
  | GetSessionsMessage
  | GetOutputMessage
  | SendKeyMessage
  | ResizeTerminalMessage
  | BrowseDirectoryMessage
  | ScrollMessage
  | PingMessage;

export type ClientMessageType = ClientMessage['type'];

// === Server Messages (Daemon → PWA) ===

export interface AuthResultMessage {
  type: 'auth_result';
  payload: { success: boolean };
}

export interface SessionsListMessage {
  type: 'sessions_list';
  payload: { sessions: SessionInfo[] };
}

export interface SessionCreatedMessage {
  type: 'session_created';
  payload: { session: SessionInfo };
}

export interface SessionUpdatedMessage {
  type: 'session_updated';
  payload: { session: SessionInfo };
}

export interface SessionKilledMessage {
  type: 'session_killed';
  payload: { sessionId: string };
}

export interface InputRequiredMessage {
  type: 'input_required';
  payload: {
    sessionId: string;
    inputType: InputType;
    context: string;
    question: string;
    options?: string[];
    timestamp: number;
  };
}

export interface OutputUpdateMessage {
  type: 'output_update';
  payload: { sessionId: string; content: string };
}

export interface ContextLimitMessage {
  type: 'context_limit';
  payload: { sessionId: string; message: string };
}

export interface CapabilitiesMessage {
  type: 'capabilities';
  payload: Capabilities;
}

export interface ErrorMessage {
  type: 'error';
  payload: { message: string; sessionId?: string };
}

export interface DirectoryListingMessage {
  type: 'directory_listing';
  payload: { path: string; directories: string[]; error?: string };
}

export interface ScrollbackContentMessage {
  type: 'scrollback_content';
  payload: { sessionId: string; content: string };
}

export interface PongMessage {
  type: 'pong';
  payload: Record<string, never>;
}

export type ServerMessage =
  | AuthResultMessage
  | SessionsListMessage
  | SessionCreatedMessage
  | SessionUpdatedMessage
  | SessionKilledMessage
  | InputRequiredMessage
  | OutputUpdateMessage
  | ContextLimitMessage
  | CapabilitiesMessage
  | DirectoryListingMessage
  | ScrollbackContentMessage
  | ErrorMessage
  | PongMessage;

export type ServerMessageType = ServerMessage['type'];
