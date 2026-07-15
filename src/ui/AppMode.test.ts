import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_KNOBS } from '../audio/types';
import { loadStoredKnobs, loadStoredMode, storeKnobs, storeMode } from './AppMode';

// Node has no localStorage — provide a minimal in-memory stand-in.
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

describe('mode persistence', () => {
  it('defaults to drift when nothing is stored', () => {
    expect(loadStoredMode()).toBe('drift');
  });

  it('round-trips both modes', () => {
    storeMode('calibrate');
    expect(loadStoredMode()).toBe('calibrate');
    storeMode('drift');
    expect(loadStoredMode()).toBe('drift');
  });

  it('ignores unknown stored values', () => {
    (globals.localStorage as MemoryStorage).setItem('ao-mode', 'party');
    expect(loadStoredMode()).toBe('drift');
  });
});

describe('knob persistence', () => {
  it('returns null when nothing is stored', () => {
    expect(loadStoredKnobs()).toBeNull();
  });

  it('round-trips a full knob set', () => {
    const knobs = {
      sound: {
        warmth: 0.1,
        space: 0.9,
        activity: 0.5,
        memory: 0.2,
        entropy: 0.3,
        pulse: 0.7,
        foundation: 0.6,
        width: 0.35,
        texture: 0.85,
      },
      visual: { grain: 0.4, ripple: 0.6, drift: 0.5, focus: 0.8, trails: 0.25, fog: 0.65 },
    };
    storeKnobs(knobs);
    expect(loadStoredKnobs()).toEqual(knobs);
  });

  it('rejects malformed JSON', () => {
    (globals.localStorage as MemoryStorage).setItem('ao-knobs', '{not json');
    expect(loadStoredKnobs()).toBeNull();
  });

  it('backfills missing keys with defaults so old calibrations still load', () => {
    // A blob saved before the foundation/width/texture and trails/fog knobs
    // existed — every present value should survive, new keys get defaults.
    const legacy = {
      sound: { warmth: 0.1, space: 0.9, activity: 0.5, memory: 0.2, entropy: 0.3, pulse: 0.7 },
      visual: { grain: 0.4, ripple: 0.6, drift: 0.5, focus: 0.8 },
    };
    (globals.localStorage as MemoryStorage).setItem('ao-knobs', JSON.stringify(legacy));
    const loaded = loadStoredKnobs();
    expect(loaded).not.toBeNull();
    expect(loaded!.sound.warmth).toBe(0.1);
    expect(loaded!.visual.focus).toBe(0.8);
    expect(loaded!.sound.foundation).toBe(DEFAULT_KNOBS.sound.foundation);
    expect(loaded!.sound.width).toBe(DEFAULT_KNOBS.sound.width);
    expect(loaded!.sound.texture).toBe(DEFAULT_KNOBS.sound.texture);
    expect(loaded!.visual.trails).toBe(DEFAULT_KNOBS.visual.trails);
    expect(loaded!.visual.fog).toBe(DEFAULT_KNOBS.visual.fog);
  });

  it('rejects out-of-range, non-finite, or wrong-type values', () => {
    const base = {
      sound: { ...DEFAULT_KNOBS.sound },
      visual: { ...DEFAULT_KNOBS.visual },
    };

    const outOfRange = { ...base, sound: { ...base.sound, space: 1.5 } };
    (globals.localStorage as MemoryStorage).setItem('ao-knobs', JSON.stringify(outOfRange));
    expect(loadStoredKnobs()).toBeNull();

    const wrongType = { ...base, visual: { ...base.visual, grain: 'high' } };
    (globals.localStorage as MemoryStorage).setItem('ao-knobs', JSON.stringify(wrongType));
    expect(loadStoredKnobs()).toBeNull();
  });

  it('drops unknown extra keys instead of persisting them', () => {
    const withExtra = {
      sound: { ...DEFAULT_KNOBS.sound, bass: 0.9 },
      visual: { ...DEFAULT_KNOBS.visual },
    };
    (globals.localStorage as MemoryStorage).setItem('ao-knobs', JSON.stringify(withExtra));
    const loaded = loadStoredKnobs();
    expect(loaded).not.toBeNull();
    expect('bass' in loaded!.sound).toBe(false);
  });
});
