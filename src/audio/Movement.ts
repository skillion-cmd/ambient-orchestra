import type { MovementPhase } from './types';
import {
  generatePhrase,
  melodyDurationBeats,
  pickPhraseType,
} from './MusicTheory';

export const PHASE_LABELS: Record<MovementPhase, string> = {
  drift: 'Heat Haze',
  gather: 'Gather',
  bloom: 'Bloom',
  hang: 'Hang',
  dissolve: 'Morph',
  exhale: 'Exhale',
};

/**
 * Arc shapes a movement can take. Classic is the canonical wave; the
 * variants keep long sessions from repeating the same crest forever.
 * Every timeline starts with drift (executeMovementSkip resets there)
 * and contains a dissolve (requestNextMovement jumps to it).
 */
export type MovementVariant = 'classic' | 'doubleBloom' | 'longHang' | 'noBloom';

export interface PhaseSegment {
  phase: MovementPhase;
  start: number;
}

export function buildTimeline(variant: MovementVariant): PhaseSegment[] {
  switch (variant) {
    case 'classic':
      return [
        { phase: 'drift', start: 0 },
        { phase: 'gather', start: 0.18 },
        { phase: 'bloom', start: 0.35 },
        { phase: 'hang', start: 0.58 },
        { phase: 'dissolve', start: 0.72 },
        { phase: 'exhale', start: 0.88 },
      ];
    case 'doubleBloom':
      return [
        { phase: 'drift', start: 0 },
        { phase: 'gather', start: 0.12 },
        { phase: 'bloom', start: 0.26 },
        { phase: 'hang', start: 0.42 },
        { phase: 'bloom', start: 0.55 },
        { phase: 'hang', start: 0.7 },
        { phase: 'dissolve', start: 0.8 },
        { phase: 'exhale', start: 0.9 },
      ];
    case 'longHang':
      return [
        { phase: 'drift', start: 0 },
        { phase: 'gather', start: 0.15 },
        { phase: 'bloom', start: 0.32 },
        { phase: 'hang', start: 0.48 },
        { phase: 'dissolve', start: 0.8 },
        { phase: 'exhale', start: 0.9 },
      ];
    case 'noBloom':
      return [
        { phase: 'drift', start: 0 },
        { phase: 'gather', start: 0.28 },
        { phase: 'hang', start: 0.55 },
        { phase: 'dissolve', start: 0.78 },
        { phase: 'exhale', start: 0.9 },
      ];
  }
}

const VARIANT_WEIGHTS: Record<MovementVariant, number> = {
  classic: 0.55,
  doubleBloom: 0.17,
  longHang: 0.16,
  noBloom: 0.12,
};

/** Weighted pick, never repeating the previous movement's variant. */
export function pickMovementVariant(
  previous: MovementVariant | null,
): MovementVariant {
  const pool = (Object.keys(VARIANT_WEIGHTS) as MovementVariant[]).filter(
    (v) => v !== previous,
  );
  const total = pool.reduce((sum, v) => sum + VARIANT_WEIGHTS[v], 0);
  let roll = Math.random() * total;
  for (const v of pool) {
    roll -= VARIANT_WEIGHTS[v];
    if (roll <= 0) return v;
  }
  return pool[pool.length - 1]!;
}

/** One generative "song" — roughly 3–5 minutes of arc */
export class Movement {
  readonly durationSec: number;
  readonly timeline: PhaseSegment[];
  elapsed = 0;
  index: number;
  phase: MovementPhase = 'drift';
  private segmentIndex = 0;

  constructor(
    index: number,
    readonly variant: MovementVariant = 'classic',
  ) {
    this.index = index;
    this.timeline = buildTimeline(variant);
    const base = variant === 'doubleBloom' ? 240 : variant === 'longHang' ? 210 : 180;
    this.durationSec = base + Math.random() * 120;
  }

  advance(dt: number): boolean {
    this.elapsed += dt;
    const p = Math.min(1, this.elapsed / this.durationSec);
    this.syncToProgress(p);
    return p >= 1;
  }

  progress(): number {
    return Math.min(1, this.elapsed / this.durationSec);
  }

  /** Jump to a phase (manual nudge) — prefers the next occurrence ahead,
   * falling back to the last occurrence anywhere (doubleBloom has two). */
  jumpToPhase(phase: MovementPhase): MovementPhase {
    let target = -1;
    for (let i = this.segmentIndex + 1; i < this.timeline.length; i++) {
      if (this.timeline[i]!.phase === phase) {
        target = i;
        break;
      }
    }
    if (target < 0) {
      for (let i = this.timeline.length - 1; i >= 0; i--) {
        if (this.timeline[i]!.phase === phase) {
          target = i;
          break;
        }
      }
    }
    if (target < 0) return this.phase;
    this.elapsed = (this.timeline[target]!.start + 0.002) * this.durationSec;
    this.segmentIndex = target;
    this.phase = phase;
    return this.phase;
  }

  /** Advance to the next segment within this movement, or null at the end */
  advanceToNextPhase(): MovementPhase | null {
    const next = this.timeline[this.segmentIndex + 1];
    if (!next) return null;
    this.elapsed = (next.start + 0.002) * this.durationSec;
    this.segmentIndex += 1;
    this.phase = next.phase;
    return this.phase;
  }

  private syncToProgress(p: number): void {
    let idx = 0;
    for (let i = 0; i < this.timeline.length; i++) {
      if (this.timeline[i]!.start <= p) idx = i;
      else break;
    }
    this.segmentIndex = idx;
    this.phase = this.timeline[idx]!.phase;
  }

  /** How much harmonic/melodic density this phase wants (0–1) */
  density(): number {
    switch (this.phase) {
      case 'drift':
        return 0.3;
      case 'gather':
        return 0.48;
      case 'bloom':
        return 0.88;
      case 'hang':
        return 0.78;
      case 'dissolve':
        return 0.42;
      case 'exhale':
        return 0.52;
    }
  }

  /** Melody presence for dreamlike bleed */
  melodyPresence(): number {
    switch (this.phase) {
      case 'drift':
        return 0.28;
      case 'gather':
        return 0.5;
      case 'bloom':
        return 0.92;
      case 'hang':
        return 0.75;
      case 'dissolve':
        return 0.48;
      case 'exhale':
        return 0.35;
    }
  }
}

export function pickMelodyPhrase(
  scaleLen: number,
  phase: MovementPhase = 'drift',
  previousHook: number[] | null = null,
): number[] {
  const phraseType = pickPhraseType(phase);
  return generatePhrase(scaleLen, phraseType, previousHook);
}

export { pickPhraseType, melodyDurationBeats };
