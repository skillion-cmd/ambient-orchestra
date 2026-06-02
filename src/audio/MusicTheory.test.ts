import { describe, expect, it, vi } from 'vitest';
import { pickInitialChord, pickNextChord, pickPhraseType, generatePhrase } from './MusicTheory';

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
