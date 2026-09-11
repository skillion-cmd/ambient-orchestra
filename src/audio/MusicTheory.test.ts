import { describe, expect, it, vi } from 'vitest';
import {
  functionForDegrees,
  generatePhrase,
  pickInitialChord,
  pickNextChord,
  pickPhraseType,
  voicingFromDegrees,
} from './MusicTheory';

describe('MusicTheory', () => {
  it('pickInitialChord favors tonic in bloom', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const result = pickInitialChord('bloom');
    expect(result.fn).toBe('tonic');
    vi.restoreAllMocks();
  });

  it('pickNextChord returns valid chord degrees from transitions', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const result = pickNextChord('tonic', 'gather', 0.2);
    expect(result.degrees.length).toBeGreaterThan(0);
    expect(result.fn).toBeDefined();
    expect(result.brightness).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });

  it('high entropy can force color chord', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const result = pickNextChord('dominant', 'dissolve', 1);
    expect(result.fn).toBe('color');
    vi.restoreAllMocks();
  });

  it('pickPhraseType returns recall-friendly types in dissolve', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    expect(['recall', 'drift']).toContain(pickPhraseType('dissolve'));
    vi.restoreAllMocks();
  });

  it('generatePhrase hook settles on a degree', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const phrase = generatePhrase(7, 'hook', null);
    expect(phrase.length).toBe(8);
    vi.restoreAllMocks();
  });
});

describe('voicingFromDegrees', () => {
  it('builds a triad on a single indicated degree', () => {
    expect(voicingFromDegrees([2], 7)).toEqual([2, 4, 6]);
  });

  it('wraps degrees into the scale and sorts them', () => {
    expect(voicingFromDegrees([9, 0, 4], 7)).toEqual([0, 2, 4]);
  });

  it('dedupes what wraps onto the same degree', () => {
    expect(voicingFromDegrees([0, 7, 14, 2], 7)).toEqual([0, 2]);
  });

  it('caps a cluster at four tones', () => {
    expect(voicingFromDegrees([0, 1, 2, 3, 4, 5], 7)).toEqual([0, 1, 2, 3]);
  });

  it('falls back to a tonic triad on nonsense', () => {
    expect(voicingFromDegrees([], 7)).toEqual([0, 2, 4]);
    expect(voicingFromDegrees([0, 2], 0)).toEqual([0, 2, 4]);
  });
});

describe('functionForDegrees', () => {
  it('reads the function from the degree the chord sits on', () => {
    expect(functionForDegrees([0, 2, 4], 7)).toBe('tonic');
    expect(functionForDegrees([3, 5, 0], 7)).toBe('subdominant');
    expect(functionForDegrees([4, 6, 1], 7)).toBe('dominant');
    expect(functionForDegrees([1, 3, 5], 7)).toBe('color');
  });

  it('wraps before reading', () => {
    expect(functionForDegrees([7], 7)).toBe('tonic');
    expect(functionForDegrees([10], 7)).toBe('subdominant');
    expect(functionForDegrees([-3], 7)).toBe('dominant');
  });
});
