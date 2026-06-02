import { describe, expect, it, vi } from 'vitest';
import { HarmonicField } from './HarmonicField';
import { MusicalClock } from './MusicalClock';
import type { SoundKnobs } from './types';
import { DEFAULT_KNOBS } from './types';

const KNOBS: SoundKnobs = { ...DEFAULT_KNOBS.sound };

function mockClock(): MusicalClock {
  return {
    update: () => {},
    isNewBar: () => false,
    isDownbeat: () => false,
    beatDurationSec: () => 1.03,
    beatPulse: 0,
    currentBar: 0,
    beatInBar: 0,
    subdivision: 0,
    init: () => {},
  } as MusicalClock;
}

describe('HarmonicField', () => {
  it('starts in drift phase with low density', () => {
    const field = new HarmonicField();
    expect(field.getMovementDensity()).toBeLessThan(0.4);
  });

  it('emits transition bloom after crossfade completes', () => {
    const field = new HarmonicField();
    const clock = mockClock();

    field.skipToNextMovement(KNOBS);
    expect(field.isHarmonicTransitioning()).toBe(true);
    expect(field.consumeTransitionBloom()).toBe(false);

    for (let i = 0; i < 520; i++) {
      field.advance(0.05, clock, KNOBS);
    }

    expect(field.isHarmonicTransitioning()).toBe(false);
    expect(field.consumeTransitionBloom()).toBe(true);
    expect(field.consumeTransitionBloom()).toBe(false);
  });

  it('emits phrase cadence when melody phrase wraps', () => {
    const field = new HarmonicField();
    const clock = mockClock();

    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    let cadence: string | null = null;
    for (let i = 0; i < 800 && !cadence; i++) {
      field.advance(0.05, clock, { ...KNOBS, memory: 0.9 });
      cadence = field.consumePhraseCadence();
    }

    expect(cadence).toBeTruthy();
    vi.restoreAllMocks();
  });

  it('advanceToNextPhase walks movement arc', () => {
    const field = new HarmonicField();
    expect(field.advanceToNextPhase()).toBe('gather');
    expect(field.advanceToNextPhase()).toBe('bloom');
  });
});
