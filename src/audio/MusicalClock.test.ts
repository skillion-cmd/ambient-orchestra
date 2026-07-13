import { describe, expect, it } from 'vitest';
import { bpmFor } from './MusicalClock';
import type { MovementPhase } from './types';

const PHASES: MovementPhase[] = ['drift', 'gather', 'bloom', 'hang', 'dissolve', 'exhale'];

describe('bpmFor', () => {
  it('legacy mode spans 52-72 BPM with ±6 phase sway', () => {
    expect(bpmFor('gather', 0, false)).toBe(52);
    expect(bpmFor('gather', 1, false)).toBe(72);
    expect(bpmFor('bloom', 0.5, false)).toBe(62 + 6);
    expect(bpmFor('exhale', 0.5, false)).toBe(62 - 6);
  });

  it('steady mode widens the knob range to 46-78 BPM', () => {
    expect(bpmFor('gather', 0, true)).toBe(46);
    expect(bpmFor('gather', 1, true)).toBe(78);
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
