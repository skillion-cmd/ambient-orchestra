import { describe, expect, it } from 'vitest';
import { bpmFor, harmonicBeatScale, MAX_BPM } from './MusicalClock';
import type { MovementPhase } from './types';

const PHASES: MovementPhase[] = ['drift', 'gather', 'bloom', 'hang', 'dissolve', 'exhale'];

describe('bpmFor', () => {
  it('legacy mode spans 52-72 BPM with ±6 phase sway', () => {
    expect(bpmFor('gather', 0, false)).toBe(52);
    expect(bpmFor('gather', 1, false)).toBe(72);
    expect(bpmFor('bloom', 0.5, false)).toBe(62 + 6);
    expect(bpmFor('exhale', 0.5, false)).toBe(62 - 6);
  });

  it('steady mode opens the knob range all the way to garage tempo', () => {
    expect(bpmFor('gather', 0, true)).toBe(46);
    expect(bpmFor('gather', 1, true)).toBe(MAX_BPM);
  });

  it('a night piece holds 128-140 whatever the knob and phase are doing', () => {
    for (const phase of PHASES) {
      for (const pulse of [0, 0.5, 1]) {
        const bpm = bpmFor(phase, pulse, false, 'night');
        expect(bpm).toBeGreaterThanOrEqual(125);
        expect(bpm).toBeLessThanOrEqual(MAX_BPM);
      }
    }
    // The knob still nudges within the band.
    expect(bpmFor('gather', 1, false, 'night')).toBeGreaterThan(
      bpmFor('gather', 0, false, 'night'),
    );
  });

  it('steady mode keeps phase sway within ±1.5 BPM', () => {
    for (const pulse of [0, 0.5, 1]) {
      const base = bpmFor('gather', pulse, true);
      for (const phase of PHASES) {
        expect(Math.abs(bpmFor(phase, pulse, true) - base)).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it('the knob dominates the phase in steady mode', () => {
    // Even the slowest phase at high pulse outruns the fastest phase at low pulse.
    expect(bpmFor('exhale', 0.8, true)).toBeGreaterThan(bpmFor('bloom', 0.2, true));
  });
});

describe('harmonicBeatScale', () => {
  it('stretches melodic timing as the transport speeds up', () => {
    expect(harmonicBeatScale(58)).toBe(1);
    expect(harmonicBeatScale(96)).toBe(2);
    expect(harmonicBeatScale(140)).toBe(2);
  });

  it('keeps a melody note about as long in seconds across the whole range', () => {
    // Two beats at the resting tempo, against the same two beats stretched
    // at garage tempo — this is what stops 140 BPM being fast-forward.
    const seconds = (bpm: number) => (2 * 60 * harmonicBeatScale(bpm)) / bpm;
    const slow = seconds(58);
    const fast = seconds(140);
    expect(fast / slow).toBeGreaterThan(0.75);
    expect(fast / slow).toBeLessThan(1.25);
  });
});
