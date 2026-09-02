import { describe, expect, it } from 'vitest';
import {
  advanceEnergy,
  chordTrim,
  duckFor,
  findBlend,
  instrumentLevel,
  isBlendId,
  PLAY_BLENDS,
  velocityCurve,
} from './PlayBlend';

const withBlend = findBlend('with');

describe('chordTrim', () => {
  it('leaves a single note alone', () => {
    expect(chordTrim(0)).toBe(1);
    expect(chordTrim(1)).toBe(1);
  });

  it('pulls a chord back without cancelling it out', () => {
    // A six-note chord must still be louder than one note — full 1/n
    // compensation would make it quieter than the note it started from.
    const six = chordTrim(6) * 6;
    expect(six).toBeGreaterThan(2);
    expect(six).toBeLessThan(4);
  });

  it('keeps pulling back as voices are added', () => {
    for (let n = 2; n <= 12; n++) {
      expect(chordTrim(n)).toBeLessThan(chordTrim(n - 1));
    }
  });
});

describe('velocityCurve', () => {
  it('stays inside 0–1', () => {
    expect(velocityCurve(-3)).toBeGreaterThan(0);
    expect(velocityCurve(0)).toBeLessThan(0.15);
    expect(velocityCurve(2)).toBeCloseTo(1, 5);
  });

  it('leaves real dynamic range under a moderate press', () => {
    // The computer keybed sends 0.7. Under the old linear 0.25 + v * 0.75
    // that was 0.78 of full — nearly everything, which is why it read as
    // one loud level however you played.
    expect(velocityCurve(0.7)).toBeLessThan(0.65);
    expect(velocityCurve(0.7)).toBeGreaterThan(0.4);
  });

  it('rises monotonically', () => {
    let prev = -1;
    for (let v = 0; v <= 1.0001; v += 0.05) {
      const shaped = velocityCurve(v);
      expect(shaped).toBeGreaterThan(prev);
      prev = shaped;
    }
  });
});

describe('duckFor', () => {
  it('leaves the orchestra alone when nothing is being played', () => {
    const duck = duckFor(withBlend, 0);
    for (const value of Object.values(duck)) expect(value).toBe(1);
  });

  it('makes room in the instrument’s register, not everywhere', () => {
    const duck = duckFor(withBlend, 1);
    // Melody and air share the keybed's range and step back the furthest;
    // the sub and the beat are nowhere near it and barely move.
    expect(duck.melody).toBeLessThan(duck.pad);
    expect(duck.air).toBeLessThan(duck.pad);
    expect(duck.pad).toBeLessThan(duck.pulse);
    expect(duck.sub).toBeGreaterThan(0.85);
  });

  it('is proportional to how much is being played', () => {
    const light = duckFor(withBlend, 0.25);
    const heavy = duckFor(withBlend, 1);
    expect(light.melody).toBeGreaterThan(heavy.melody);
    expect(light.melody).toBeLessThan(1);
  });

  it('never ducks past the blend’s floor, however hard it is driven', () => {
    const duck = duckFor(withBlend, 5);
    expect(duck.melody).toBeCloseTo(withBlend.floor.melody, 6);
  });

  it('goes deeper the further forward the blend sits', () => {
    const behind = duckFor(findBlend('behind'), 1);
    const front = duckFor(findBlend('front'), 1);
    expect(front.melody).toBeLessThan(behind.melody);
  });
});

describe('instrumentLevel', () => {
  it('rides the session arc partially, never all the way down', () => {
    const full = instrumentLevel(withBlend, 1);
    const trough = instrumentLevel(withBlend, 0.2);
    expect(full).toBeCloseTo(withBlend.level, 6);
    expect(trough).toBeLessThan(full);
    expect(trough).toBeGreaterThan(full * 0.5);
  });

  it('holds the front more firmly the further forward the blend sits', () => {
    const quiet = 0.3;
    const behindDrop = instrumentLevel(findBlend('behind'), quiet) / findBlend('behind').level;
    const frontDrop = instrumentLevel(findBlend('front'), quiet) / findBlend('front').level;
    expect(frontDrop).toBeGreaterThan(behindDrop);
  });

  it('stays well under the unity gain the first version ran at', () => {
    for (const blend of PLAY_BLENDS) expect(blend.level).toBeLessThan(0.8);
  });
});

describe('advanceEnergy', () => {
  it('rises inside a note’s attack', () => {
    // 50ms — shorter than every preset's attack but the bell's.
    const after = advanceEnergy(0, 1, 0.05);
    expect(after).toBeGreaterThan(0.15);
  });

  it('holds up while keys are held', () => {
    let energy = 0;
    for (let i = 0; i < 120; i++) energy = advanceEnergy(energy, 3, 1 / 60);
    expect(energy).toBeCloseTo(Math.min(1, 0.42 + 3 * 0.17), 2);
  });

  it('carries a chord further than a single note', () => {
    let one = 0;
    let many = 0;
    for (let i = 0; i < 120; i++) {
      one = advanceEnergy(one, 1, 1 / 60);
      many = advanceEnergy(many, 6, 1 / 60);
    }
    expect(many).toBeGreaterThan(one);
    expect(many).toBeLessThanOrEqual(1);
  });

  it('decays over a couple of seconds, not instantly', () => {
    let energy = 1;
    for (let i = 0; i < 30; i++) energy = advanceEnergy(energy, 0, 1 / 60);
    // Half a second after the last key: the bed is still behind you, so a
    // gap between phrases doesn't make the orchestra surge back in.
    expect(energy).toBeGreaterThan(0.6);
    for (let i = 0; i < 330; i++) energy = advanceEnergy(energy, 0, 1 / 60);
    expect(energy).toBeLessThan(0.15);
  });

  it('settles at exactly zero so the duck stops being rewritten', () => {
    let energy = 1;
    for (let i = 0; i < 3000; i++) energy = advanceEnergy(energy, 0, 1 / 60);
    expect(energy).toBe(0);
  });
});

describe('isBlendId', () => {
  it('accepts every blend and nothing else', () => {
    for (const blend of PLAY_BLENDS) expect(isBlendId(blend.id)).toBe(true);
    expect(isBlendId('loud')).toBe(false);
    expect(isBlendId(undefined)).toBe(false);
    expect(isBlendId(2)).toBe(false);
  });

  it('falls back to playing with the ensemble on an unknown id', () => {
    expect(findBlend('nonsense').id).toBe('with');
  });
});
