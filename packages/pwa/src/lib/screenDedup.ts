export function stripAnsi(s: string): string {
  return s.replace(/\x1b(?:\[[0-9;?]*[a-zA-Z]|\([A-Z])/g, '').trimEnd();
}
