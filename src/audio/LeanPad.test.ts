import { describe, expect, it } from 'vitest';
import { spreadDetune, sweepCurve } from './LeanPad';

// LeanPad has to sound like the PolySynth(MonoSynth) it replaced, and the
// two places it computes that sound rather than handing it to Tone are these.
// The rest — envelopes, phase-offset saws — runs Tone's own arithmetic and is
// checked by rendering both side by side, which needs an audio context.
describe('spreadDetune', () => {
  it('spreads the saws evenly across the spread, centred, as FatOscillator does', () => {
    expect([0, 1, 2].map((i) => spreadDetune(30, 3, i))).toEqual([-15, 0, 15]);
    expect([0, 1, 2, 3].map((i) => spreadDetune(18, 4, i))).toEqual([-9, -3, 3, 9]);
  });

  it('leaves a single saw on pitch', () => {
    expect(spreadDetune(30, 1, 0)).toBe(0);
  });
});

describe('sweepCurve', () => {
  // MonoSynth's filter envelope has `exponent: 2`: the cutoff above its base
  // is the envelope squared times the range. That square law is most of the
  // swell's character, and a linear sweep opens the filter audibly early.
  const range = 1400;
  const curve = sweepCurve(range);
  const at = (x: number) => curve[Math.round(((x + 1) / 2) * (curve.length - 1))]!;

  it('rests at the base and reaches the full range at the top', () => {
    expect(at(0)).toBeCloseTo(0, 0);
    expect(at(1)).toBeCloseTo(range, 6);
  });

  it('follows the square of the envelope, not the envelope', () => {
    for (const x of [0.25, 0.5, 0.75]) {
      expect(at(x) / range).toBeCloseTo(x * x, 2);
    }
  });

  it('samples at the resolution Tone maps its shapers with', () => {
    expect(curve.length).toBe(1024);
  });
});
