import { describe, expect, it } from 'vitest';
import { bpmFor, harmonicBeatScale, MAX_BPM } from './MusicalClock';
import type { MovementPhase } from './types';
import { NIGHT_GROOVES } from './types';

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

describe('bpmFor — night grooves', () => {
  it('puts each groove in its own band', () => {
    // House sits under garage, Detroit over it. The bands are narrow: the
    // knob nudges within one rather than sweeping between them.
    expect(bpmFor('gather', 0, false, 'night', 'house')).toBe(120);
    expect(bpmFor('gather', 1, false, 'night', 'house')).toBe(127);
    expect(bpmFor('gather', 0, false, 'night', 'two-step')).toBe(128);
    expect(bpmFor('gather', 1, false, 'night', 'two-step')).toBe(138);
    expect(bpmFor('gather', 0, false, 'night', 'techno')).toBe(130);
    expect(bpmFor('gather', 1, false, 'night', 'techno')).toBe(140);
  });

  it('keeps house under techno wherever the knob sits', () => {
    for (const pulse of [0, 0.25, 0.5, 0.75, 1]) {
      expect(bpmFor('gather', pulse, false, 'night', 'house')).toBeLessThan(
        bpmFor('gather', pulse, false, 'night', 'techno'),
      );
    }
  });

  it('sways a couple of BPM across the arc, and no more', () => {
    for (const groove of NIGHT_GROOVES) {
      const flat = bpmFor('gather', 0.5, false, 'night', groove);
      const peak = bpmFor('bloom', 0.5, false, 'night', groove);
      const end = bpmFor('exhale', 0.5, false, 'night', groove);
      expect(peak).toBeGreaterThan(flat);
      expect(end).toBeLessThan(flat);
      expect(peak - end).toBeLessThanOrEqual(5);
    }
  });

  it('never exceeds the transport ceiling', () => {
    for (const groove of NIGHT_GROOVES) {
      for (const phase of PHASES) {
        expect(bpmFor(phase, 1, true, 'night', groove)).toBeLessThanOrEqual(MAX_BPM);
      }
    }
  });

  it('leaves open pieces alone', () => {
    // The groove argument is meaningless off a night piece and must not leak.
    for (const groove of NIGHT_GROOVES) {
      expect(bpmFor('gather', 0.5, false, 'open', groove)).toBe(
        bpmFor('gather', 0.5, false, 'open'),
      );
    }
  });

  it('holds a club tempo where the melodic side halves', () => {
    // The whole reason a club groove and an ambient orchestra can be one
    // piece: at these tempos the melodic clock is stretched by two.
    for (const groove of NIGHT_GROOVES) {
      expect(harmonicBeatScale(bpmFor('gather', 0.5, false, 'night', groove))).toBe(2);
    }
  });
});
