import type { HarmonicContext, ModalityWeights, MovementPhase, VisualKnobs } from '../audio/types';
import type { AudioFeatures } from '../audio/types';
import { createNoise2D } from 'simplex-noise';

/** Continuous visual state — evolves like the soundscape, never pops */
export interface FluidState {
  opacity: number;
  contourDepth: number;
  flowRate: number;
  turbulence: number;
  layerSpread: number;
  voidScale: number;
  /** Ink-in-water swell when ensemble breathes together */
  swell: number;
  /** Slow crossfade between movement shapes */
  morph: number;
  fieldDrift: number;
  ghostMix: number;
  /** Blended visual modality weights */
  modalities: ModalityWeights;
}

const DEFAULT_MODALITIES: ModalityWeights = {
  rings: 1,
  streamers: 0,
  spark: 0,
  ghost: 0.15,
  pulse: 0,
};

const DEFAULT: FluidState = {
  opacity: 0.6,
  contourDepth: 0.5,
  flowRate: 0.25,
  turbulence: 0.45,
  layerSpread: 1,
  voidScale: 1,
  swell: 0,
  morph: 0,
  fieldDrift: 0,
  ghostMix: 0.15,
  modalities: { ...DEFAULT_MODALITIES },
};

function phaseTargets(phase: MovementPhase, progress: number): Partial<FluidState> {
  switch (phase) {
    case 'drift':
      return {
        opacity: 0.52,
        contourDepth: 0.35,
        flowRate: 0.18,
        turbulence: 0.38,
        layerSpread: 0.88,
        voidScale: 1.04,
        ghostMix: 0.12,
      };
    case 'gather':
      return {
        opacity: 0.62 + progress * 0.06,
        contourDepth: 0.42 + progress * 0.12,
        flowRate: 0.22 + progress * 0.1,
        turbulence: 0.45 + progress * 0.08,
        layerSpread: 0.92 + progress * 0.08,
        voidScale: 1.01,
        ghostMix: 0.2 + progress * 0.1,
      };
    case 'bloom':
      return {
        opacity: 0.8,
        contourDepth: 0.62,
        flowRate: 0.38,
        turbulence: 0.58,
        layerSpread: 1.1,
        voidScale: 0.94,
        ghostMix: 0.32,
      };
    case 'hang':
      return {
        opacity: 0.76,
        contourDepth: 0.55,
        flowRate: 0.32,
        turbulence: 0.52,
        layerSpread: 1.06,
        voidScale: 0.96,
        ghostMix: 0.28,
      };
    case 'dissolve':
      return {
        opacity: 0.5 - progress * 0.08,
        contourDepth: 0.48 - progress * 0.1,
        flowRate: 0.2,
        turbulence: 0.5 + progress * 0.06,
        layerSpread: 0.94,
        voidScale: 1.06,
        ghostMix: 0.35 + progress * 0.12,
      };
    case 'exhale':
      return {
        opacity: 0.55,
        contourDepth: 0.48,
        flowRate: 0.26,
        turbulence: 0.55,
        layerSpread: 0.9,
        voidScale: 1.04,
        ghostMix: 0.32,
      };
  }
}

function modalityTargets(
  harmonic: HarmonicContext,
  audio: AudioFeatures,
  phase: MovementPhase,
): ModalityWeights {
  const g = harmonic.groupActivity;

  let streamers =
    g.melody * 0.72 +
    g.flurry * 0.88 +
    harmonic.surpriseFlash * 0.42 +
    harmonic.ensemblePulse * 0.38;
  let spark = g.shimmer * 0.78 + audio.highs * 0.22 + harmonic.surpriseFlash * 0.12;
  let ghost =
    0.1 +
    g.air * 0.58 +
    (1 - g.foundation) * 0.04 +
    harmonic.ensemblePulse * 0.08;
  let pulse = g.clips * 0.82 + harmonic.beatPulse * 0.18 * g.clips;

  switch (phase) {
    case 'drift':
      streamers *= 0.28;
      spark *= 0.35;
      ghost *= 0.85;
      break;
    case 'gather':
      streamers *= 0.55;
      ghost += 0.12;
      break;
    case 'bloom':
      streamers *= 1.25;
      spark *= 1.2;
      ghost += 0.08;
      break;
    case 'hang':
      streamers *= 1.05;
      spark *= 0.9;
      break;
    case 'dissolve':
      streamers *= 0.45;
      spark *= 0.55;
      ghost += 0.28;
      pulse *= 0.7;
      break;
    case 'exhale':
      streamers *= 0.32;
      spark *= 0.45;
      ghost += 0.18;
      pulse *= 0.5;
      break;
  }

  return {
    rings: 1,
    streamers: clamp01(streamers),
    spark: clamp01(spark),
    ghost: clamp01(ghost),
    pulse: clamp01(pulse),
  };
}

export class FluidField {
  private state: FluidState = { ...DEFAULT };
  private readonly fieldNoise = createNoise2D(() => 41.2);
  private lastMovementIndex = -1;
  private morphT = 1;
  private readonly morphDuration = 28;
  private fieldAngle = 0;
  private evolution = 0;

  update(
    harmonic: HarmonicContext,
    dt: number,
    knobs: VisualKnobs,
    audio: AudioFeatures,
  ): FluidState {
    this.evolution += dt * 0.011;

    if (harmonic.movementIndex !== this.lastMovementIndex && this.lastMovementIndex >= 0) {
      this.morphT = 0;
    }
    this.lastMovementIndex = harmonic.movementIndex;

    if (this.morphT < 1) {
      this.morphT = Math.min(1, this.morphT + dt / this.morphDuration);
    }

    const targets = phaseTargets(harmonic.movementPhase, harmonic.movementProgress);
    const smooth = 1 - Math.exp(-dt / 3.5);

    this.state.opacity += ((targets.opacity ?? this.state.opacity) - this.state.opacity) * smooth;
    this.state.contourDepth +=
      ((targets.contourDepth ?? this.state.contourDepth) - this.state.contourDepth) * smooth;
    this.state.flowRate +=
      ((targets.flowRate ?? this.state.flowRate) - this.state.flowRate) * smooth;
    this.state.turbulence +=
      ((targets.turbulence ?? this.state.turbulence) - this.state.turbulence) * smooth;
    this.state.layerSpread +=
      ((targets.layerSpread ?? this.state.layerSpread) - this.state.layerSpread) * smooth;
    this.state.voidScale +=
      ((targets.voidScale ?? this.state.voidScale) - this.state.voidScale) * smooth;
    this.state.ghostMix +=
      ((targets.ghostMix ?? this.state.ghostMix) - this.state.ghostMix) * smooth;

    const swellTarget =
      harmonic.ensemblePulse * 0.55 +
      harmonic.beatPulse * 0.2 +
      harmonic.movementProgress * 0.05 +
      audio.mids * 0.08;
    this.state.swell += (swellTarget - this.state.swell) * (1 - Math.exp(-dt / 2));
    this.state.morph = this.morphT;

    this.fieldAngle += dt * (0.04 + knobs.drift * 0.06);
    this.state.fieldDrift +=
      (0.35 + knobs.drift * 0.4 - this.state.fieldDrift) * (1 - Math.exp(-dt / 5));

    const modTargets = modalityTargets(harmonic, audio, harmonic.movementPhase);
    const modSmooth = 1 - Math.exp(-dt / 2.2);
    const m = this.state.modalities;
    m.streamers += (modTargets.streamers - m.streamers) * modSmooth;
    m.spark += (modTargets.spark - m.spark) * modSmooth;
    m.ghost += (modTargets.ghost - m.ghost) * modSmooth;
    m.pulse += (modTargets.pulse - m.pulse) * modSmooth;

    this.state.ghostMix = Math.min(0.58, this.state.ghostMix + m.ghost * 0.1);

    return { ...this.state, modalities: { ...m } };
  }

  /** Density along a contour — thick/thin bands that migrate, not radial splashes */
  densityAt(theta: number, layer: number, time: number, flow: number): number {
    const f = this.state.fieldDrift;
    const n1 = this.fieldNoise(
      Math.cos(theta + time * flow) * 2.1 + layer * 0.3,
      Math.sin(theta + time * flow * 0.7) * 2.1 + this.evolution,
    );
    const n2 = this.fieldNoise(
      theta * 3 + time * flow * 1.3 + f,
      layer * 0.5 + this.fieldAngle,
    );
    const wave = Math.sin(theta * 2 + time * 0.4 + layer * 0.8 + this.fieldAngle) * 0.5 + 0.5;
    return clamp01(n1 * 0.35 + n2 * 0.35 + wave * 0.3 + 0.08);
  }

  /** Advection — particles drift along the ring */
  flowOffset(layer: number, time: number): number {
    return time * this.state.flowRate * (0.85 + layer * 0.04);
  }

  getState(): FluidState {
    return { ...this.state };
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
