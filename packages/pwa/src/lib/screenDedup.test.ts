import { describe, it, expect } from 'vitest';
import { stripAnsi, computeLinesToPush } from './screenDedup.js';

describe('stripAnsi', () => {
  it('strips SGR color codes', () => {
    expect(stripAnsi('\x1b[32mgreen\x1b[0m text')).toBe('green text');
  });

  it('strips 256-color codes', () => {
    expect(stripAnsi('\x1b[38;5;123mcolored\x1b[0m')).toBe('colored');
  });

  it('strips cursor positioning', () => {
    expect(stripAnsi('\x1b[10;5H')).toBe('');
  });

  it('trims trailing whitespace', () => {
    expect(stripAnsi('hello   ')).toBe('hello');
  });

  it('returns empty for escape-only strings', () => {
    expect(stripAnsi('\x1b[5;3H')).toBe('');
  });
});

describe('computeLinesToPush', () => {
  function makeArgs(oldRaw: string[], newRaw: string[]) {
    return [
      oldRaw,
      oldRaw.map(stripAnsi),
      newRaw,
      newRaw.map(stripAnsi),
    ] as const;
  }

  it('returns empty for empty old screen', () => {
    const result = computeLinesToPush([], [], ['A', 'B'], ['A', 'B']);
    expect(result.linesToPush).toEqual([]);
    expect(result.isContextSwitch).toBe(false);
  });

  it('returns empty for identical screens (minor redraw)', () => {
    const lines = ['line1', 'line2', 'line3', 'line4', 'line5'];
    const result = computeLinesToPush(...makeArgs(lines, lines));
    expect(result.linesToPush).toEqual([]);
    expect(result.isContextSwitch).toBe(false);
  });

  it('detects shift=1 (one new line at bottom)', () => {
    const old = ['A', 'B', 'C', 'D', 'E'];
    const next = ['B', 'C', 'D', 'E', 'F'];
    const result = computeLinesToPush(...makeArgs(old, next));
    expect(result.linesToPush).toEqual(['A']);
    expect(result.isContextSwitch).toBe(false);
  });

  it('detects shift=3 (three new lines at bottom)', () => {
    const old = ['A', 'B', 'C', 'D', 'E'];
    const next = ['D', 'E', 'F', 'G', 'H'];
    const result = computeLinesToPush(...makeArgs(old, next));
    expect(result.linesToPush).toEqual(['A', 'B', 'C']);
    expect(result.isContextSwitch).toBe(false);
  });

  it('preserves ANSI colors in pushed lines', () => {
    const oldRaw = ['\x1b[32mgreen\x1b[0m', 'plain', 'other', 'more', 'end'];
    const oldStripped = oldRaw.map(stripAnsi);
    const newRaw = ['plain', 'other', 'more', 'end', 'new'];
    const newStripped = newRaw.map(stripAnsi);
    const result = computeLinesToPush(oldRaw, oldStripped, newRaw, newStripped);
    expect(result.linesToPush).toEqual(['\x1b[32mgreen\x1b[0m']);
  });

  it('detects context switch (>50% different, no overlap)', () => {
    const old = ['A', 'B', 'C', 'D'];
    const next = ['X', 'Y', 'Z', 'W'];
    const result = computeLinesToPush(...makeArgs(old, next));
    expect(result.linesToPush).toEqual(['A', 'B', 'C', 'D']);
    expect(result.isContextSwitch).toBe(true);
  });

  it('returns empty for minor redraw (<50% different)', () => {
    const old = ['A', 'B', 'C', 'D', 'E', 'F'];
    const next = ['A', 'B', 'X', 'D', 'E', 'F']; // 1/6 different
    const result = computeLinesToPush(...makeArgs(old, next));
    expect(result.linesToPush).toEqual([]);
    expect(result.isContextSwitch).toBe(false);
  });

  it('ignores trailing empty lines (tmux padding)', () => {
    const old = ['A', 'B', 'C', '', '', ''];
    const next = ['B', 'C', 'D', '', '', ''];
    const result = computeLinesToPush(...makeArgs(old, next));
    // old trimmed = [A, B, C], new trimmed = [B, C, D]
    // shift=1: old[1:] = [B, C] matches new[0:2] = [B, C]
    expect(result.linesToPush).toEqual(['A']);
  });

  it('handles cursor escape at end of screen', () => {
    // tmux appends cursor position like \x1b[5;3H at the end
    const old = ['A', 'B', 'C', 'D', '\x1b[5;3H'];
    const next = ['B', 'C', 'D', 'E', '\x1b[5;10H'];
    // stripped: old = [A, B, C, D, ''], new = [B, C, D, E, '']
    // trimmed: old = [A, B, C, D], new = [B, C, D, E]
    // shift=1: old[1:] = [B, C, D] matches new[0:3] = [B, C, D]
    const result = computeLinesToPush(...makeArgs(old, next));
    expect(result.linesToPush).toEqual(['A']);
  });

  it('handles shift=2 with padding', () => {
    const old = ['A', 'B', 'C', 'D', 'E', '', ''];
    const next = ['C', 'D', 'E', 'F', 'G', '', ''];
    const result = computeLinesToPush(...makeArgs(old, next));
    expect(result.linesToPush).toEqual(['A', 'B']);
  });

  it('handles all-empty old screen', () => {
    const old = ['', '', '', ''];
    const next = ['A', 'B', '', ''];
    const result = computeLinesToPush(...makeArgs(old, next));
    // trimmed old is empty
    expect(result.linesToPush).toEqual([]);
  });
});
