import { describe, expect, it } from 'vitest';
import { KIT_LABELS, KIT_LAYOUT, kitPieceFor } from './PlayKit';
import { duckFor, findBlend, PLAY_BLENDS } from './PlayBlend';

describe('kit layout', () => {
  it('repeats every octave, so a key means the same piece wherever you play it', () => {
    for (let note = 24; note <= 108; note++) {
      expect(kitPieceFor(note)).toBe(kitPieceFor(note + 12));
    }
  });

  it('covers the octave with no piece missing a key', () => {
    const pieces = new Set(KIT_LAYOUT);
    expect(pieces.size).toBe(12);
    for (const id of KIT_LAYOUT) expect(KIT_LABELS[id]).toBeTruthy();
  });

  it('puts the kick and the snare on the two easiest keys', () => {
    expect(kitPieceFor(60)).toBe('kick');
    expect(kitPieceFor(62)).toBe('snare');
  });
});

describe('the duck in Beat mode', () => {
  it('makes room in the rhythm section rather than in the melody', () => {
    for (const blend of PLAY_BLENDS) {
      const beat = duckFor(blend, 1, 'beat');
      const melody = duckFor(blend, 1, 'melody');
      // Playing drums, the Conductor's kit is where your hands are.
      expect(beat.pulse).toBeLessThan(melody.pulse);
      // And the melodic voices have no reason to move.
      expect(beat.melody).toBeGreaterThan(melody.melody);
    }
  });

  it('leaves the orchestra alone when nothing is being played', () => {
    const blend = findBlend('front');
    const idle = duckFor(blend, 0, 'beat');
    for (const layer of Object.keys(idle) as (keyof typeof idle)[]) {
      expect(idle[layer]).toBeCloseTo(1, 9);
    }
  });

  it('leans further the harder each blend is set to lean', () => {
    const behind = duckFor(findBlend('behind'), 1, 'beat');
    const front = duckFor(findBlend('front'), 1, 'beat');
    expect(front.pulse).toBeLessThan(behind.pulse);
  });
});
