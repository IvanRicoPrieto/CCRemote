import { describe, it, expect } from 'vitest';
import { stripAnsi } from './screenDedup.js';

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
