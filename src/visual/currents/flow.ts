import { createNoise3D } from 'simplex-noise';
import type { MovementPhase } from '../../audio/types';

/** Parameters shaping the vector field at sample time. */
export interface FlowParams {
  /** Noise spatial frequency — small = broad calm cells, large = tight eddies. */
  scale: number;
  /** Weight of the second, finer octave (0 = laminar, 1 = turbulent). */
  warp: number;
  /** Time coordinate — advance to make the field evolve. */
  evolve: number;
}

export interface FlowVector {
  vx: number;
  vy: number;
}

export type FlowField = (x: number, y: number, p: FlowParams, out: FlowVector) => void;

/** Character of the field per movement phase. */
export interface FlowCharacter {
  scale: number;
  warp: number;
  /** How fast `evolve` should advance per second. */
  evolveRate: number;
}

const PHASE_CHARACTER: Record<MovementPhase, FlowCharacter> = {
  drift: { scale: 0.055, warp: 0.15, evolveRate: 0.02 },
  gather: { scale: 0.08, warp: 0.4, evolveRate: 0.035 },
  bloom: { scale: 0.105, warp: 0.7, evolveRate: 0.05 },
  hang: { scale: 0.09, warp: 0.55, evolveRate: 0.04 },
  dissolve: { scale: 0.075, warp: 0.65, evolveRate: 0.03 },
  exhale: { scale: 0.05, warp: 0.1, evolveRate: 0.018 },
};

export function flowCharacterFor(phase: MovementPhase): FlowCharacter {
  return PHASE_CHARACTER[phase];
}

/** Deterministic PRNG so a seeded field is reproducible in tests. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EPS = 0.05;

/**
 * Curl-noise vector field — the wind-map primitive. Velocity is the curl of
 * a scalar simplex potential, (dN/dy, -dN/dx), which is divergence-free:
 * streamlines circulate and shear like weather instead of piling up at
 * noise minima. A second octave at 2.7x frequency, weighted by `warp`,
 * roughens the flow from laminar to squally.
 */
export function createFlowField(seed = 1337): FlowField {
  const noise = createNoise3D(mulberry32(seed));

  const potential = (x: number, y: number, p: FlowParams): number => {
    const base = noise(x * p.scale, y * p.scale, p.evolve);
    if (p.warp <= 0) return base;
    const s = p.scale * 2.7;
    return base + noise(x * s + 100, y * s + 100, p.evolve * 1.6) * p.warp;
  };

  return (x, y, p, out) => {
    const dx = (potential(x + EPS, y, p) - potential(x - EPS, y, p)) / (2 * EPS);
    const dy = (potential(x, y + EPS, p) - potential(x, y - EPS, p)) / (2 * EPS);
    out.vx = dy;
    out.vy = -dx;
  };
}
