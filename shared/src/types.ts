export type SessionType = 'claude' | 'shell';

export type SessionState =
  | 'starting'
  | 'idle'
  | 'working'
  | 'awaiting_input'
  | 'awaiting_confirmation'
  | 'context_limit'
  | 'error'
  | 'dead';

export type InputType = 'confirmation' | 'selection' | 'open_question';

export interface SessionInfo {
  id: string;
  sessionType: SessionType;
  projectPath: string;
  projectName: string;
  model: string;
  planMode: boolean;
  autoAccept: boolean;
  state: SessionState;
  createdAt: string;
  lastActivity: string;
  contextUsageEstimate?: number;
  tmuxSession?: string;
}

export interface SessionConfig {
  projectPath: string;
  model?: string;
  planMode?: boolean;
  autoAccept?: boolean;
  sessionType?: SessionType;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
}

export interface ModeInfo {
  id: string;
  name: string;
  description: string;
  requiresRestart: boolean;
  flag: string;
}

export interface CommandInfo {
  id: string;
  name: string;
  description: string;
  input: string;
}

export interface Capabilities {
  models: ModelInfo[];
  modes: ModeInfo[];
  commands: CommandInfo[];
}

export interface FileListingEntry {
  name: string;
  isDirectory: boolean;
  size: number;
}
