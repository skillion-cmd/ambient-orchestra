import type { VisualKnobs } from '../audio/types';

/** Derived visual parameters from the vision knobs */
export interface VisualKnobParams {
  particleTarget: number;
  sizeScale: number;
  dotAlpha: number;
  orbitWobble: number;
  loopAmpScale: number;
  arcSpanScale: number;
  waveSpikeScale: number;
  noiseJitter: number;
  fieldRotation: number;
  spinRate: number;
  loopSpeed: number;
  angularStep: number;
  trailFade: number;
}

export function resolveVisualKnobs(knobs: VisualKnobs): VisualKnobParams {
  const { grain, ripple, drift } = knobs;

  return {
    particleTarget: Math.floor(200 + grain * 760),
    sizeScale: 0.7 + grain * 1.05,
    dotAlpha: 0.1 + grain * 0.24,

    orbitWobble: ripple * 14,
    loopAmpScale: 0.4 + ripple * 1.55,
    arcSpanScale: 0.45 + ripple * 1.35,
    waveSpikeScale: 0.2 + ripple * 1.65,
    noiseJitter: 0.04 + ripple * 0.42,

    fieldRotation: 0.1 + drift * 0.65,
    spinRate: 0.18 + drift * 1.25,
    loopSpeed: 0.65 + drift * 1.05,
    angularStep: 0.025 + drift * 0.2,
    trailFade: 0.038 + drift * 0.085,
  };
}
