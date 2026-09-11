import { describe, expect, it } from 'vitest';
import {
  modeAspectFor,
  modeForChord,
  plateAspectFor,
  plateAt,
  type PlateGradient,
  type PlateMode,
} from './plate';
import type { HarmonicContext, MovementPhase } from '../../audio/types';
import { EMPTY_GROUP_ACTIVITY, MODE_SCALES } from '../../audio/types';

const grad = (): PlateGradient => ({ psi: 0, du: 0, dv: 0 });

function psiAt(u: number, v: number, mode: PlateMode, aspect = 1): number {
  const out = grad();
  plateAt(u, v, mode, out, aspect);
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

  // The diagonal symmetry belongs to the square, and it is most of what
  // makes the figure read — which is why the plate is kept close to one
  // rather than cut to the window. See plateAspectFor.
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

  it('keeps its gradient honest on a rectangular plate too', () => {
    const mode: PlateMode = { n: 3, m: 5 };
    const a = 1.78;
    const h = 1e-5;
    for (const [u, v] of [
      [0.13, -0.27],
      [-0.62, 0.41],
      [0.78, 0.78],
    ] as const) {
      const out = grad();
      plateAt(u, v, mode, out, a);
      expect(out.du).toBeCloseTo((psiAt(u + h, v, mode, a) - psiAt(u - h, v, mode, a)) / (2 * h), 3);
      expect(out.dv).toBeCloseTo((psiAt(u, v + h, mode, a) - psiAt(u, v - h, mode, a)) / (2 * h), 3);
    }
  });

  it('shows more of the same figure on a wider plate, never a stretched one', () => {
    // The claim the aspect parameter makes good on: a point at world (x, y)
    // on a plate of half-height B and half-width aB sees exactly what the
    // square plate has at (x/B, y/B). Same figure, same scale, more plate.
    // Only a fraction of the plate's shape is spent this way — see
    // modeAspectFor — but that fraction is undistorted.
    const mode: PlateMode = { n: 3, m: 5 };
    const B = 2.4;
    for (const a of [1.33, 1.78, 2.4, 0.6]) {
      for (const [x, y] of [
        [0.4, -1.1],
        [-2.0, 0.7],
        [1.55, 1.9],
        [0, 0],
      ] as const) {
        const wide = psiAt(x / (a * B), y / B, mode, a);
        const square = psiAt(x / B, y / B, mode, 1);
        expect(wide).toBeCloseTo(square, 12);
      }
    }
  });

  it('keeps both mirror symmetries at any aspect — the figure still reads', () => {
    const mode: PlateMode = { n: 2, m: 7 };
    for (const a of [1, 1.78, 0.75]) {
      for (const [u, v] of [
        [0.3, -0.8],
        [0.95, 0.1],
        [-0.44, 0.67],
      ] as const) {
        expect(psiAt(-u, v, mode, a)).toBeCloseTo(psiAt(u, v, mode, a), 12);
        expect(psiAt(u, -v, mode, a)).toBeCloseTo(psiAt(u, v, mode, a), 12);
      }
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

describe('plateAspectFor', () => {
  it('is square when the window is', () => {
    expect(plateAspectFor(1)).toBeCloseTo(1, 12);
  });

  it('leans towards the window without ever reaching it', () => {
    for (const windowAspect of [1.2, 1.6, 1.78]) {
      const plate = plateAspectFor(windowAspect);
      expect(plate).toBeGreaterThan(1);
      expect(plate).toBeLessThan(windowAspect);
    }
  });

  it('stops leaning at all, rather than following an ultrawide window', () => {
    // The figure has to stay a figure. Past the cap the plate holds its
    // shape and the field frames it, which is a plate on a bench.
    const wide = plateAspectFor(2.4);
    const wider = plateAspectFor(6);
    expect(wider).toBeCloseTo(wide, 12);
    expect(wide).toBeLessThan(1.4);
  });

  it('treats a tall window exactly as it treats a wide one', () => {
    for (const windowAspect of [1.3, 1.9, 3.2]) {
      expect(plateAspectFor(1 / windowAspect)).toBeCloseTo(1 / plateAspectFor(windowAspect), 12);
    }
  });

  it('survives a zero-height window rather than returning a NaN plate', () => {
    expect(Number.isFinite(plateAspectFor(0))).toBe(true);
    expect(Number.isFinite(plateAspectFor(Number.POSITIVE_INFINITY))).toBe(true);
  });
});

describe('modeAspectFor', () => {
  it('spends part of the plate’s shape on cells and part on stretch', () => {
    const plate = 1.34;
    const modes = modeAspectFor(plate);
    expect(modes).toBeGreaterThan(1);
    expect(modes).toBeLessThan(plate);
    // Whatever the modes do not absorb arrives as stretch, and both halves
    // have to stay small enough not to be read as a distortion.
    expect(plate / modes).toBeLessThan(1.2);
    expect(modes).toBeLessThan(1.2);
  });

  it('leaves a square plate alone', () => {
    expect(modeAspectFor(1)).toBeCloseTo(1, 12);
  });
});
