import type { HarmonicContext, MovementPhase } from '../../audio/types';
import type { VisualForm } from '../VisualForm';

export interface MorphologyWeights {
  network: number;
  sphere: number;
  waveform: number;
}

const PHASE_WEIGHTS: Record<MovementPhase, MorphologyWeights> = {
  drift: { network: 0.72, sphere: 0.18, waveform: 0.1 },
  gather: { network: 0.42, sphere: 0.48, waveform: 0.1 },
  bloom: { network: 0.12, sphere: 0.78, waveform: 0.1 },
  hang: { network: 0.18, sphere: 0.68, waveform: 0.14 },
  dissolve: { network: 0.22, sphere: 0.28, waveform: 0.5 },
  exhale: { network: 0.58, sphere: 0.12, waveform: 0.3 },
};

/** Continuous morphology from movement — no hard form pops */
export function morphologyFromHarmonic(harmonic: HarmonicContext): MorphologyWeights {
  return { ...PHASE_WEIGHTS[harmonic.movementPhase] };
}

export function dominantForm(weights: MorphologyWeights): VisualForm {
  if (weights.sphere >= weights.network && weights.sphere >= weights.waveform) return 'sphere';
  if (weights.waveform >= weights.network) return 'waveform';
  return 'network';
}

/** Manual nudge — rotate weight emphasis */
export function nudgeMorphology(weights: MorphologyWeights): MorphologyWeights {
  const order: (keyof MorphologyWeights)[] = ['network', 'sphere', 'waveform'];
  let maxKey: keyof MorphologyWeights = 'network';
  let maxVal = weights.network;
  for (const k of order) {
    if (weights[k] > maxVal) {
      maxVal = weights[k];
      maxKey = k;
    }
  }
  const next = order[(order.indexOf(maxKey) + 1) % order.length]!;
  const out = {
    ...weights,
    [maxKey]: Math.max(0.08, weights[maxKey] - 0.22),
    [next]: weights[next] + 0.22,
  };
  normalizeWeights(out);
  return out;
}

export function normalizeWeights(w: MorphologyWeights): void {
  const sum = w.network + w.sphere + w.waveform;
  if (sum < 1e-6) return;
  w.network /= sum;
  w.sphere /= sum;
  w.waveform /= sum;
}

export function lerpMorphology(a: MorphologyWeights, b: MorphologyWeights, t: number): MorphologyWeights {
  return {
    network: a.network + (b.network - a.network) * t,
    sphere: a.sphere + (b.sphere - a.sphere) * t,
    waveform: a.waveform + (b.waveform - a.waveform) * t,
  };
}
