import { EventEmitter } from 'node:events';
import type { InputType } from '@ccremote/shared';

export interface InputRequiredEvent {
  type: InputType;
  context: string;
  question: string;
  options?: string[];
  timestamp: number;
}

export interface OutputParserEvents {
  input_required: (event: InputRequiredEvent) => void;
  working: (context: string) => void;
  context_limit: (context: string) => void;
  possibly_idle: () => void;
  activity: () => void;
}

export class OutputParser extends EventEmitter {
  private readonly INPUT_PATTERNS: Array<{ pattern: RegExp; type: InputType }> = [
    // Confirmations
    { pattern: /Do you want to (proceed|continue|apply|make these changes)\?/i, type: 'confirmation' },
    { pattern: /\(y\/n\)/i, type: 'confirmation' },
    { pattern: /\(Y\/n\)/i, type: 'confirmation' },
    { pattern: /\[Y\/n\]/i, type: 'confirmation' },
    { pattern: /\[yes\/no\]/i, type: 'confirmation' },
    { pattern: /\[y\/N\]/i, type: 'confirmation' },

    // Tool/command approval
    { pattern: /Allow .+ to run/i, type: 'confirmation' },
    { pattern: /Press Enter to run|Approve|Reject|Edit/i, type: 'confirmation' },

    // Selection
    { pattern: /Choose an option/i, type: 'selection' },
    { pattern: /Select .+:/i, type: 'selection' },
    { pattern: /\[\d+\]/m, type: 'selection' },

    // Open questions (Claude asking something)
    { pattern: /\?\s*$/m, type: 'open_question' },
  ];

  private readonly WORKING_PATTERNS: RegExp[] = [
    /Thinking\.\.\./i,
    /Reading file/i,
    /Writing file/i,
    /Running command/i,
    /Searching/i,
    /Analyzing/i,
    /Editing/i,
    /Creating/i,
    /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/, // Spinner characters
  ];

  private readonly CONTEXT_LIMIT_PATTERNS: RegExp[] = [
    /context (window|limit)/i,
    /too long/i,
    /maximum.*token/i,
    /conversation is too long/i,
    /context.*exceeded/i,
  ];

  private idleTimer: NodeJS.Timeout | null = null;
  private readonly idleThresholdMs: number;
  private buffer: string = '';
  private readonly MAX_BUFFER_SIZE = 10000;

  constructor(idleThresholdMs: number = 3000) {
    super();
    this.idleThresholdMs = idleThresholdMs;
  }

  feed(data: string): void {
    this.emit('activity');
    this.resetIdleTimer();

    // Accumulate in buffer for context
    this.buffer += data;
    if (this.buffer.length > this.MAX_BUFFER_SIZE) {
      this.buffer = this.buffer.slice(-this.MAX_BUFFER_SIZE);
    }

    // Check for context limit
    for (const pattern of this.CONTEXT_LIMIT_PATTERNS) {
      if (pattern.test(data)) {
        this.emit('context_limit', this.getRecentContext());
        return;
      }
    }

    // Check for working patterns
    for (const pattern of this.WORKING_PATTERNS) {
      if (pattern.test(data)) {
        this.emit('working', data);
        return;
      }
    }

    // Check for input patterns
    for (const { pattern, type } of this.INPUT_PATTERNS) {
      if (pattern.test(data)) {
        const question = this.extractQuestion(data);
        const options = type === 'selection' ? this.extractOptions(data) : undefined;

        this.emit('input_required', {
          type,
          context: this.getRecentContext(),
          question,
          options,
          timestamp: Date.now(),
        } satisfies InputRequiredEvent);
        return;
      }
    }
  }

  private extractQuestion(data: string): string {
    // Try to find the last line that looks like a question
    const lines = data.split('\n').filter((l) => l.trim().length > 0);
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line && (line.includes('?') || /\(y\/n\)/i.test(line) || /\[Y\/n\]/i.test(line))) {
        return line.trim();
      }
    }
    return lines[lines.length - 1]?.trim() ?? data.trim();
  }

  private extractOptions(data: string): string[] {
    const options: string[] = [];
    const optionPattern = /\[(\d+)\]\s*(.+)/g;
    let match;
    while ((match = optionPattern.exec(data)) !== null) {
      if (match[2]) {
        options.push(match[2].trim());
      }
    }
    return options.length > 0 ? options : undefined as unknown as string[];
  }

  private getRecentContext(): string {
    // Return last ~50 lines of buffer
    const lines = this.buffer.split('\n');
    return lines.slice(-50).join('\n');
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      this.emit('possibly_idle');
    }, this.idleThresholdMs);
  }

  clearBuffer(): void {
    this.buffer = '';
  }

  destroy(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.removeAllListeners();
  }
}
