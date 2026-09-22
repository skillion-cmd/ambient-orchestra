import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cycleStep,
  emptyPattern,
  hitCount,
  isEmpty,
  KIT_PATTERN_PRESETS,
  KIT_ROWS,
  loadStoredPattern,
  parsePattern,
  patternFromPreset,
  patternSteps,
  resizePattern,
  serializePattern,
  setStep,
  storePattern,
  STEPS_PER_BAR,
} from './KitPattern';
import { KIT_LAYOUT } from './PlayKit';

describe('emptyPattern', () => {
  it('gives every piece a row the length of the loop', () => {
    const pattern = emptyPattern(4);
    expect(patternSteps(pattern)).toBe(64);
    for (const piece of KIT_LAYOUT) expect(pattern.rows[piece]).toHaveLength(64);
    expect(isEmpty(pattern)).toBe(true);
  });
});

describe('KIT_ROWS', () => {
  it('holds every piece the keybed can play, once', () => {
    expect([...KIT_ROWS].sort()).toEqual([...KIT_LAYOUT].sort());
  });

  it('reads like a drum machine — cymbals up top, kick on the floor', () => {
    expect(KIT_ROWS[0]).toBe('ride');
    expect(KIT_ROWS[KIT_ROWS.length - 1]).toBe('kick');
  });
});

describe('cycleStep', () => {
  it('walks silent → hit → accent → silent', () => {
    let pattern = emptyPattern(2);
    pattern = cycleStep(pattern, 'kick', 0);
    expect(pattern.rows.kick[0]).toBe(1);
    pattern = cycleStep(pattern, 'kick', 0);
    expect(pattern.rows.kick[0]).toBe(2);
    pattern = cycleStep(pattern, 'kick', 0);
    expect(pattern.rows.kick[0]).toBe(0);
  });

  it('never mutates the pattern it was handed', () => {
    const before = emptyPattern(2);
    const after = cycleStep(before, 'snare', 4);
    expect(before.rows.snare[4]).toBe(0);
    expect(after.rows.snare[4]).toBe(1);
  });
});

describe('setStep', () => {
  it('ignores a step outside the loop rather than growing the row', () => {
    const pattern = emptyPattern(2);
    expect(setStep(pattern, 'kick', 99, 2)).toBe(pattern);
    expect(setStep(pattern, 'kick', -1, 2)).toBe(pattern);
  });
});

describe('resizePattern', () => {
  it('tiles the groove when the loop grows, so the front half repeats', () => {
    let pattern = emptyPattern(2);
    pattern = setStep(pattern, 'kick', 0, 2);
    pattern = setStep(pattern, 'snare', 8, 1);
    const grown = resizePattern(pattern, 4);
    expect(patternSteps(grown)).toBe(64);
    expect(grown.rows.kick[0]).toBe(2);
    expect(grown.rows.kick[32]).toBe(2);
    expect(grown.rows.snare[8]).toBe(1);
    expect(grown.rows.snare[40]).toBe(1);
    expect(hitCount(grown)).toBe(hitCount(pattern) * 2);
  });

  it('truncates when the loop shrinks', () => {
    let pattern = emptyPattern(4);
    pattern = setStep(pattern, 'kick', 0, 1);
    pattern = setStep(pattern, 'kick', 48, 2);
    const cut = resizePattern(pattern, 2);
    expect(patternSteps(cut)).toBe(32);
    expect(cut.rows.kick[0]).toBe(1);
    expect(hitCount(cut)).toBe(1);
  });

  it('is a no-op at the same length', () => {
    const pattern = emptyPattern(8);
    expect(resizePattern(pattern, 8)).toBe(pattern);
  });
});

describe('patternFromPreset', () => {
  it('tiles a one-bar preset over the whole loop', () => {
    const four = KIT_PATTERN_PRESETS.find((p) => p.id === 'four')!;
    const pattern = patternFromPreset(four, 4);
    expect(patternSteps(pattern)).toBe(64);
    for (let bar = 0; bar < 4; bar++) {
      expect(pattern.rows.kick[bar * STEPS_PER_BAR]).toBe(2);
      expect(pattern.rows.snare[bar * STEPS_PER_BAR + 4]).toBe(2);
    }
  });

  it('ships presets that all fit a bar exactly', () => {
    for (const preset of KIT_PATTERN_PRESETS) {
      for (const row of Object.values(preset.bar)) {
        expect(row).toHaveLength(STEPS_PER_BAR);
      }
    }
  });
});

describe('parsePattern', () => {
  it('round-trips through the stored shape', () => {
    let pattern = emptyPattern(4);
    pattern = setStep(pattern, 'hatClosed', 3, 1);
    pattern = setStep(pattern, 'kick', 0, 2);
    const back = parsePattern(serializePattern(pattern));
    expect(back).toEqual(pattern);
  });

  it('keeps the rows it can read when one comes back the wrong length', () => {
    const stored = serializePattern(setStep(emptyPattern(2), 'kick', 0, 2));
    stored.rows.snare = '101';
    const back = parsePattern(stored)!;
    expect(back.rows.kick[0]).toBe(2);
    expect(back.rows.snare.every((level) => level === 0)).toBe(true);
  });

  it('rejects a shape that is not a pattern', () => {
    expect(parsePattern(null)).toBeNull();
    expect(parsePattern({ bars: 3, rows: {} })).toBeNull();
    expect(parsePattern({ rows: {} })).toBeNull();
  });
});

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  clear(): void {
    this.data.clear();
  }
}

const globals = globalThis as { localStorage?: unknown };
let saved: unknown;

beforeEach(() => {
  saved = globals.localStorage;
  globals.localStorage = new MemoryStorage();
});

afterEach(() => {
  globals.localStorage = saved;
});

describe('stored patterns', () => {
  it('comes back the way it went in', () => {
    const pattern = patternFromPreset(KIT_PATTERN_PRESETS[1]!, 8);
    storePattern(pattern);
    expect(loadStoredPattern()).toEqual(pattern);
  });

  it('is null when nothing was ever stored', () => {
    expect(loadStoredPattern()).toBeNull();
  });

  it('survives corruption rather than throwing into the panel', () => {
    localStorage.setItem('ao-kit', '{not json');
    expect(loadStoredPattern()).toBeNull();
  });
});
