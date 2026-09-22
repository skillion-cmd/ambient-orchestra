import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addCue,
  allLayers,
  CUE_LAYER_FLOOR,
  cueAtBar,
  cueStarts,
  defaultPerformance,
  duplicateCue,
  estimateSeconds,
  loadStoredPerformance,
  makeCue,
  moveCue,
  parsePerformance,
  presenceForCue,
  removeCue,
  storePerformance,
  totalBars,
  updateCue,
} from './Performance';

describe('defaultPerformance', () => {
  it('hands you an arc rather than a blank page', () => {
    const performance = defaultPerformance();
    expect(performance.cues.length).toBeGreaterThan(1);
    expect(performance.cues[0]!.phase).toBe('drift');
    expect(performance.cues[performance.cues.length - 1]!.phase).toBe('exhale');
  });

  it('gives every cue its own id', () => {
    const ids = defaultPerformance().cues.map((cue) => cue.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('totalBars / estimateSeconds', () => {
  it('adds the cues up', () => {
    const performance = { loop: false, startFresh: null, cues: [makeCue({ bars: 4 }), makeCue({ bars: 8 })] };
    expect(totalBars(performance)).toBe(12);
    // 12 bars of 4/4 at 120bpm is 24 seconds.
    expect(estimateSeconds(performance, 120)).toBeCloseTo(24, 5);
  });
});

describe('cueAtBar', () => {
  const performance = {
    loop: false,
    startFresh: null,
    cues: [makeCue({ bars: 2, phase: 'drift' as const }), makeCue({ bars: 4, phase: 'bloom' as const })],
  };

  it('finds the cue a bar falls in', () => {
    expect(cueAtBar(performance, 0)!.index).toBe(0);
    expect(cueAtBar(performance, 1)!.index).toBe(0);
    expect(cueAtBar(performance, 2)!.index).toBe(1);
    expect(cueAtBar(performance, 5)!.index).toBe(1);
  });

  it('reports where inside the cue the bar is, and how much is left', () => {
    const at = cueAtBar(performance, 3)!;
    expect(at.barInCue).toBe(1);
    expect(at.barsLeft).toBe(3);
  });

  it('returns null past the end rather than holding the last cue forever', () => {
    expect(cueAtBar(performance, 6)).toBeNull();
    expect(cueAtBar(performance, -1)).toBeNull();
  });
});

describe('cueStarts', () => {
  it('gives the bar each cue opens on', () => {
    const performance = {
      loop: false,
      startFresh: null,
      cues: [makeCue({ bars: 4 }), makeCue({ bars: 2 }), makeCue({ bars: 8 })],
    };
    expect(cueStarts(performance)).toEqual([0, 4, 6]);
  });
});

describe('presenceForCue', () => {
  it('leaves a layer the cue keeps completely alone', () => {
    const presence = presenceForCue(makeCue({ layers: allLayers() }));
    expect(presence.pad).toBe(1);
    expect(presence.pulse).toBe(1);
  });

  it('pushes a layer the cue drops back rather than muting it', () => {
    const cue = makeCue({ layers: { ...allLayers(), melody: false } });
    const presence = presenceForCue(cue);
    expect(presence.melody).toBe(CUE_LAYER_FLOOR);
    expect(presence.melody).toBeGreaterThan(0);
    expect(presence.pad).toBe(1);
  });

  it('is neutral with no cue at all — nothing running, nothing held back', () => {
    const presence = presenceForCue(null);
    expect(Object.values(presence).every((v) => v === 1)).toBe(true);
  });
});

describe('editing', () => {
  it('adds, duplicates and removes', () => {
    let performance = defaultPerformance();
    const count = performance.cues.length;
    performance = addCue(performance);
    expect(performance.cues).toHaveLength(count + 1);
    performance = duplicateCue(performance, 0);
    expect(performance.cues).toHaveLength(count + 2);
    expect(performance.cues[1]!.phase).toBe(performance.cues[0]!.phase);
    expect(performance.cues[1]!.id).not.toBe(performance.cues[0]!.id);
    performance = removeCue(performance, 1);
    expect(performance.cues).toHaveLength(count + 1);
  });

  it('keeps the last cue — a set with none cannot be run', () => {
    const one = { loop: false, startFresh: null, cues: [makeCue()] };
    expect(removeCue(one, 0)).toBe(one);
  });

  it('moves a cue and refuses to move it off either end', () => {
    const performance = {
      loop: false,
      startFresh: null,
      cues: [makeCue({ bars: 1 }), makeCue({ bars: 2 }), makeCue({ bars: 4 })],
    };
    expect(moveCue(performance, 0, 1).cues.map((c) => c.bars)).toEqual([2, 1, 4]);
    expect(moveCue(performance, 2, -1).cues.map((c) => c.bars)).toEqual([1, 4, 2]);
    expect(moveCue(performance, 0, -1)).toBe(performance);
    expect(moveCue(performance, 2, 1)).toBe(performance);
  });

  it('patches one cue and leaves its id and the rest of the set alone', () => {
    const before = defaultPerformance();
    const after = updateCue(before, 1, { bars: 16, kit: false });
    expect(after.cues[1]!.bars).toBe(16);
    expect(after.cues[1]!.kit).toBe(false);
    expect(after.cues[1]!.id).toBe(before.cues[1]!.id);
    expect(after.cues[0]).toBe(before.cues[0]);
    expect(before.cues[1]!.bars).toBe(8);
  });

  it('merges a partial layer patch instead of replacing the mask', () => {
    const before = defaultPerformance();
    const after = updateCue(before, 2, { layers: { melody: false } });
    expect(after.cues[2]!.layers.melody).toBe(false);
    expect(after.cues[2]!.layers.pad).toBe(true);
  });
});

describe('parsePerformance', () => {
  it('round-trips a set', () => {
    const before = defaultPerformance();
    const raw = JSON.parse(
      JSON.stringify({
        cues: before.cues.map(({ phase, bars, layers, kit }) => ({ phase, bars, layers, kit })),
        loop: before.loop,
        startFresh: before.startFresh,
      }),
    );
    const after = parsePerformance(raw)!;
    expect(after.cues.map((c) => c.phase)).toEqual(before.cues.map((c) => c.phase));
    expect(after.cues.map((c) => c.bars)).toEqual(before.cues.map((c) => c.bars));
    expect(after.cues[1]!.layers).toEqual(before.cues[1]!.layers);
  });

  it('drops a malformed cue and keeps the rest of the set', () => {
    const parsed = parsePerformance({
      cues: [
        { phase: 'bloom', bars: 4, layers: {}, kit: true },
        { phase: 'nonsense', bars: 4 },
        { phase: 'exhale', bars: 0 },
        { phase: 'hang', bars: 2 },
      ],
    })!;
    expect(parsed.cues.map((c) => c.phase)).toEqual(['bloom', 'hang']);
  });

  it('returns null when nothing usable is left', () => {
    expect(parsePerformance({ cues: [] })).toBeNull();
    expect(parsePerformance({ cues: [{ phase: 'nope', bars: 4 }] })).toBeNull();
    expect(parsePerformance(null)).toBeNull();
  });

  it('defaults loop on and the fresh-piece request off', () => {
    const parsed = parsePerformance({ cues: [{ phase: 'bloom', bars: 4 }] })!;
    expect(parsed.loop).toBe(true);
    expect(parsed.startFresh).toBeNull();
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

describe('stored performances', () => {
  it('comes back with the same shape', () => {
    const before = { ...defaultPerformance(), loop: false, startFresh: 'night' as const };
    storePerformance(before);
    const after = loadStoredPerformance()!;
    expect(after.loop).toBe(false);
    expect(after.startFresh).toBe('night');
    expect(after.cues.map((c) => c.bars)).toEqual(before.cues.map((c) => c.bars));
  });

  it('is null when nothing was ever stored, and when it is corrupt', () => {
    expect(loadStoredPerformance()).toBeNull();
    localStorage.setItem('ao-stage', 'not json');
    expect(loadStoredPerformance()).toBeNull();
  });
});
