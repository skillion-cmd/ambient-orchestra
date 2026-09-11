import { describe, expect, it } from 'vitest';
import { modeForChord, plateAt, type PlateGradient, type PlateMode } from './plate';
import type { HarmonicContext, MovementPhase } from '../../audio/types';
import { EMPTY_GROUP_ACTIVITY, MODE_SCALES } from '../../audio/types';

const grad = (): PlateGradient => ({ psi: 0, du: 0, dv: 0 });

function psiAt(u: number, v: number, mode: PlateMode): number {
  const out = grad();
  plateAt(u, v, mode, out);
  return out.psi;
}

/** Enough of a context for the mode mapping; nothing else is read. */
function context(overrides: Partial<HarmonicContext> = {}): HarmonicContext {
  return {
    root: 'G',
    rootMidi: 43,
    scale: MODE_SCALES.lydian!,
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
    ...overrides,
  };
}

describe('plateAt', () => {
  it('has its gradient match the surface it claims to describe', () => {
    const mode: PlateMode = { n: 3, m: 5 };
    const h = 1e-5;
    for (const [u, v] of [
      [0.13, -0.27],
      [-0.62, 0.41],
      [0.78, 0.78],
      [-0.05, -0.9],
    ] as const) {
      const out = grad();
      plateAt(u, v, mode, out);
      expect(out.du).toBeCloseTo((psiAt(u + h, v, mode) - psiAt(u - h, v, mode)) / (2 * h), 4);
      expect(out.dv).toBeCloseTo((psiAt(u, v + h, mode) - psiAt(u, v - h, mode)) / (2 * h), 4);
    }
  });

  it('is antisymmetric across the diagonal — the figures are symmetric', () => {
    const mode: PlateMode = { n: 2, m: 7 };
    for (const [u, v] of [
      [0.3, -0.8],
      [0.95, 0.1],
      [-0.44, 0.67],
    ] as const) {
      expect(psiAt(v, u, mode)).toBeCloseTo(-psiAt(u, v, mode), 12);
    }
  });

  it('puts a nodal line on the diagonal, where the grains collect', () => {
    for (const u of [-0.9, -0.3, 0, 0.55, 1]) {
      expect(Math.abs(psiAt(u, u, { n: 4, m: 6 }))).toBeLessThan(1e-12);
    }
  });
});

describe('modeForChord', () => {
  it('never returns a degenerate figure — n === m has no nodal lines', () => {
    for (const scaleName of Object.keys(MODE_SCALES)) {
      const scale = MODE_SCALES[scaleName]!;
      for (const phase of [
        'drift',
        'gather',
        'bloom',
        'hang',
        'dissolve',
        'exhale',
      ] as MovementPhase[]) {
        for (const degrees of [[0, 2, 4], [0, 1, 3], [0, 2, 3, 5], [0, 2, 4, 6], [0]]) {
          for (const brightness of [0, 0.4, 1]) {
            const mode = modeForChord(
              context({ scale, movementPhase: phase, chordDegrees: degrees, brightness }),
            );
            expect(mode.n).not.toBe(mode.m);
            expect(mode.n).toBeGreaterThanOrEqual(2);
            expect(mode.m).toBeGreaterThanOrEqual(2);
            expect(Math.max(mode.n, mode.m)).toBeLessThanOrEqual(9);
          }
        }
      }
    }
  });

  it('survives an empty chord rather than drawing nothing', () => {
    const mode = modeForChord(context({ chordDegrees: [] }));
    expect(mode.n).not.toBe(mode.m);
  });

  it('answers the chord — a different chord is a different figure', () => {
    const triad = modeForChord(context({ chordDegrees: [0, 2, 4] }));
    const extended = modeForChord(context({ chordDegrees: [0, 2, 4, 6] }));
    expect(extended).not.toEqual(triad);
  });

  it('busies the figure at the crest and calms it at the edges', () => {
    const drift = modeForChord(context({ movementPhase: 'drift' }));
    const bloom = modeForChord(context({ movementPhase: 'bloom' }));
    expect(bloom.m).toBeGreaterThan(drift.m);
  });
});
