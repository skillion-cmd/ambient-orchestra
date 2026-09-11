import { describe, expect, it } from 'vitest';
import { FieldDriveSource } from './FieldDrive';
import { DEFAULT_KNOBS, EMPTY_GROUP_ACTIVITY, type HarmonicContext, type VisualKnobs } from '../audio/types';
import type { ArtDirectorDirectives } from './ArtDirectorSkill';

const KNOBS: VisualKnobs = { ...DEFAULT_KNOBS.visual };

function ctx(over: Partial<HarmonicContext> = {}): HarmonicContext {
  return {
    root: 'G',
    rootMidi: 43,
    scale: [0, 2, 4, 6, 7, 9, 11],
    mode: 'lydian',
    evolutionPhase: 0,
    chordDegrees: [0, 2, 4],
    chordFunction: 'tonic',
    brightness: 0.5,
    melodyDegrees: [0],
    melodyPhraseType: 'hook',
    melodyNoteDurationBeats: 1,
    melodyAccentPattern: [true],
    phraseMemoryId: 0,
    melodyIndex: 0,
    movementPhase: 'drift',
    movementProgress: 0,
    movementIndex: 0,
    movementScale: 'standard',
    movementDurationSec: 300,
    movementElapsedSec: 0,
    pulseProfile: 'silent',
    character: 'open',
    harmonicBeatScale: 1,
    roomPosition: 0,
    roomCorridor: 0,
    doorwayPulse: 0,
    ensemblePulse: 0,
    gestureId: 0,
    surpriseFlash: 0,
    inhaleGesture: 0,
    spaceThrowGesture: 0,
    cadenceRipple: 0,
    beatPulse: 0,
    playPulse: 0,
    groupActivity: { ...EMPTY_GROUP_ACTIVITY },
    currentBar: 0,
    beatInBar: 0,
    ...over,
  };
}

const ART: ArtDirectorDirectives = {
  fogMultiplier: 1,
  focusOffset: 0,
  moodBlend: 0,
  constellationTrigger: false,
};

describe('FieldDrive', () => {
  it('turns the gesture id into an envelope every field can read', () => {
    const src = new FieldDriveSource();
    // The first frame adopts the engine's state rather than answering it.
    expect(src.update(ctx(), KNOBS, ART, 0.5, 0.016).strike).toBe(0);
    expect(src.update(ctx(), KNOBS, ART, 0.5, 0.016).strikeId).toBe(0);

    const struck = src.update(ctx({ gestureId: 1, ensemblePulse: 0.75 }), KNOBS, ART, 0.5, 0.016);
    expect(struck.strike).toBeGreaterThan(0.5);
    expect(struck.strikeId).toBe(1);

    // Holding the same gesture id does not re-strike; the envelope decays.
    let last = struck.strike;
    for (let i = 0; i < 10; i++) {
      const next = src.update(ctx({ gestureId: 1, ensemblePulse: 0.75 }), KNOBS, ART, 0.5, 0.05);
      expect(next.strikeId).toBe(1);
      expect(next.strike).toBeLessThan(last);
      last = next.strike;
    }
  });

  it('reads the doorway as the largest strike the piece has', () => {
    const src = new FieldDriveSource();
    src.update(ctx(), KNOBS, ART, 0.5, 0.016);
    src.update(ctx({ doorwayPulse: 0.2 }), KNOBS, ART, 0.5, 0.016);
    const crossing = src.update(ctx({ doorwayPulse: 1 }), KNOBS, ART, 0.5, 0.016);
    // Full, less the frame's own decay — the envelope starts falling at once.
    expect(crossing.strike).toBeGreaterThan(0.95);
    expect(crossing.strikeId).toBe(1);
    expect(crossing.doorway).toBe(1);
  });

  it('never lets the strike leave 0..1 however hard the ensemble hits', () => {
    const src = new FieldDriveSource();
    src.update(ctx(), KNOBS, ART, 0.5, 0.016);
    for (let i = 1; i <= 40; i++) {
      const d = src.update(ctx({ gestureId: i, ensemblePulse: 1, beatPulse: 1 }), KNOBS, ART, 0.5, 0.016);
      expect(d.strike).toBeGreaterThanOrEqual(0);
      expect(d.strike).toBeLessThanOrEqual(1);
    }
  });

  it('folds the Art Director into focus and fog, clamped', () => {
    const src = new FieldDriveSource();
    const knobs: VisualKnobs = { ...KNOBS, focus: 0.9, fog: 0.5 };
    const d = src.update(ctx(), knobs, { ...ART, focusOffset: 0.4, fogMultiplier: 1.2 }, 0.5, 0.016);
    expect(d.focus).toBe(1);
    expect(d.fog).toBeCloseTo(1.2, 5);

    const low = src.update(ctx(), { ...KNOBS, focus: 0.1 }, { ...ART, focusOffset: -0.4 }, 0.5, 0.016);
    expect(low.focus).toBe(0);
  });

  it('is neutral with a neutral director, so the knobs alone still read as before', () => {
    const src = new FieldDriveSource();
    const d = src.update(ctx(), { ...KNOBS, fog: 0.5, focus: 0.28 }, ART, 0.5, 0.016);
    expect(d.fog).toBe(1);
    expect(d.focus).toBeCloseTo(0.28, 5);
    expect(d.mood).toBe(0);
  });

  it('lets a played chord reach the field the way the ensemble does', () => {
    const src = new FieldDriveSource();
    expect(src.update(ctx(), KNOBS, ART, 0.5, 0.016).expand).toBe(0);
    expect(src.update(ctx({ playPulse: 1 }), KNOBS, ART, 0.5, 0.016).expand).toBeGreaterThan(0.5);
    // And never past the ceiling when the engine throws at the same moment.
    expect(
      src.update(ctx({ playPulse: 1, spaceThrowGesture: 1 }), KNOBS, ART, 0.5, 0.016).expand,
    ).toBe(1);
  });
});
