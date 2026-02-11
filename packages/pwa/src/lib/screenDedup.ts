export function stripAnsi(s: string): string {
  return s.replace(/\x1b(?:\[[0-9;?]*[a-zA-Z]|\([A-Z])/g, '').trimEnd();
}

export interface DedupResult {
  linesToPush: string[];
  isContextSwitch: boolean;
}

export function computeLinesToPush(
  oldRawLines: string[],
  oldStrippedLines: string[],
  newRawLines: string[],
  newStrippedLines: string[],
): DedupResult {
  if (oldStrippedLines.length === 0) {
    return { linesToPush: [], isContextSwitch: false };
  }

  const oldTrimmed = trimTrailingEmpty(oldStrippedLines);
  const newTrimmed = trimTrailingEmpty(newStrippedLines);

  if (oldTrimmed.length === 0 || newTrimmed.length === 0) {
    return { linesToPush: [], isContextSwitch: false };
  }

  // Find overlap: for each possible shift (1..maxShift),
  // check if old[shift:] matches new[0:len(old)-shift]
  const maxShift = Math.floor(oldTrimmed.length * 0.8);
  for (let shift = 1; shift <= maxShift; shift++) {
    const oldSlice = oldTrimmed.slice(shift);
    const newSlice = newTrimmed.slice(0, oldSlice.length);

    if (oldSlice.length >= 2 && arraysEqual(oldSlice, newSlice)) {
      return {
        linesToPush: oldRawLines.slice(0, shift),
        isContextSwitch: false,
      };
    }
  }

  // No overlap found. Classify as minor redraw vs context switch.
  let differentCount = 0;
  const compareLen = Math.min(oldTrimmed.length, newTrimmed.length);
  for (let i = 0; i < compareLen; i++) {
    if (oldTrimmed[i] !== newTrimmed[i]) {
      differentCount++;
    }
  }
  differentCount += Math.abs(oldTrimmed.length - newTrimmed.length);
  const totalLines = Math.max(oldTrimmed.length, newTrimmed.length, 1);
  const diffRatio = differentCount / totalLines;

  if (diffRatio > 0.5) {
    return {
      linesToPush: oldRawLines.slice(0, oldRawLines.length),
      isContextSwitch: true,
    };
  }

  return { linesToPush: [], isContextSwitch: false };
}

function trimTrailingEmpty(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1]!.trim() === '') {
    end--;
  }
  return lines.slice(0, end);
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
