import { describe, expect, it } from 'vitest';
import type { AppKnobs, HarmonicContext } from '../audio/types';
import { DEFAULT_KNOBS } from '../audio/types';
import { KnobAutomator } from './KnobAutomator';

function contextAtBar(currentBar: number): HarmonicContext {
  return {
    root: 'D',
    rootMidi: 50,
    scale: [0, 2, 4, 6, 7, 9, 11],
    mode: 'lydian',
    evolutionPhase: 0,
    chordDegrees: [0, 2, 4],
    chordFunction: 'tonic',
    brightness: 0.5,
    melodyDegrees: [0, 2],
    melodyPhraseType: 'hook',
    melodyNoteDurationBeats: 2,
    melodyAccentPattern: [true, false],
    phraseMemoryId: 0,
    melodyIndex: 0,
    movementPhase: 'gather',
    movementProgress: 0.3,
    movementIndex: 0,
    ensemblePulse: 0,
    gestureId: 0,
    surpriseFlash: 0,
    inhaleGesture: 0,
    spaceThrowGesture: 0,
    cadenceRipple: 0,
    beatPulse: 0,
    groupActivity: {} as HarmonicContext['groupActivity'],
    currentBar,
    beatInBar: 0,
  };
}

/** Run the automator for many phrase boundaries and return the value extremes. */
function runSession(automator: KnobAutomator, bars: number): Map<string, { min: number; max: number }> {
  const extremes = new Map<string, { min: number; max: number }>();
  for (let bar = 0; bar <= bars; bar++) {
    // Several sub-steps per bar so values actually sweep toward targets.
    let knobs: AppKnobs = automator.getKnobs();
    for (let i = 0; i < 4; i++) {
      knobs = automator.update(1.5, contextAtBar(bar), false);
    }
    for (const [key, value] of Object.entries(knobs.sound)) {
      const cur = extremes.get(key) ?? { min: value, max: value };
      cur.min = Math.min(cur.min, value);
      cur.max = Math.max(cur.max, value);
      extremes.set(key, cur);
    }
  }
  return extremes;
}

describe('KnobAutomator', () => {
  it('freezes all values while the user is dragging', () => {
    const automator = new KnobAutomator();
    const before = automator.getKnobs();
    for (let bar = 0; bar <= 200; bar++) {
      automator.update(2, contextAtBar(bar), true);
    }
    expect(automator.getKnobs()).toEqual(before);
  });

  it('anchored mode orbits the user anchor and never moves pulse', () => {
    const automator = new KnobAutomator();
    const anchors = { ...DEFAULT_KNOBS.sound };
    const extremes = runSession(automator, 400);

    expect(extremes.get('pulse')).toEqual({ min: anchors.pulse, max: anchors.pulse });
    for (const key of [
      'warmth',
      'space',
      'activity',
      'memory',
      'entropy',
      'foundation',
      'width',
      'texture',
    ] as const) {
      const range = extremes.get(key)!;
      // Orbit ±0.08 plus phase nudges up to 0.12; values must stay near anchor.
      expect(range.min).toBeGreaterThanOrEqual(anchors[key] - 0.09);
      expect(range.max).toBeLessThanOrEqual(anchors[key] + 0.21);
    }
  });

  it('fullAuto roams beyond the anchored orbit and drives pulse', () => {
    const automator = new KnobAutomator();
    automator.setFullAuto(true);
    const anchors = { ...DEFAULT_KNOBS.sound };
    const extremes = runSession(automator, 2000);

    const pulseRange = extremes.get('pulse')!;
    expect(pulseRange.max - pulseRange.min).toBeGreaterThan(0.01);

    // At least one knob should escape the old anchored envelope.
    const escaped = (
      ['warmth', 'space', 'activity', 'memory', 'entropy', 'foundation', 'width', 'texture'] as const
    ).some(
      (key) => {
        const range = extremes.get(key)!;
        return range.min < anchors[key] - 0.22 || range.max > anchors[key] + 0.22;
      },
    );
    expect(escaped).toBe(true);

    // But never past the clamp bounds.
    for (const range of extremes.values()) {
      expect(range.min).toBeGreaterThanOrEqual(0.17);
      expect(range.max).toBeLessThanOrEqual(0.83);
    }
  });
});
