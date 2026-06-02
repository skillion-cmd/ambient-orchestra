import type { MovementPhase } from './types';
import {
  generatePhrase,
  melodyDurationBeats,
  pickPhraseType,
} from './MusicTheory';

export const PHASE_ORDER: MovementPhase[] = [
  'drift',
  'gather',
  'bloom',
  'hang',
  'dissolve',
  'exhale',
];

export const PHASE_LABELS: Record<MovementPhase, string> = {
  drift: 'Heat Haze',
  gather: 'Gather',
  bloom: 'Bloom',
  hang: 'Hang',
  dissolve: 'Morph',
  exhale: 'Exhale',
};

const PHASE_START: Record<MovementPhase, number> = {
  drift: 0,
  gather: 0.18,
  bloom: 0.35,
  hang: 0.58,
  dissolve: 0.72,
  exhale: 0.88,
};

export function nextPhase(phase: MovementPhase): MovementPhase | null {
  const idx = PHASE_ORDER.indexOf(phase);
  if (idx < 0 || idx >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1]!;
}

/** One generative "song" — roughly 3–5 minutes of arc */
export class Movement {
  readonly durationSec: number;
  elapsed = 0;
  index: number;
  phase: MovementPhase = 'drift';

  constructor(index: number) {
    this.index = index;
    this.durationSec = 180 + Math.random() * 120;
  }

  advance(dt: number): boolean {
    this.elapsed += dt;
    const p = Math.min(1, this.elapsed / this.durationSec);
    this.phase = phaseAt(p);
    return p >= 1;
  }

  progress(): number {
    return Math.min(1, this.elapsed / this.durationSec);
  }

  /** Jump to the start of a phase (manual nudge) */
  jumpToPhase(phase: MovementPhase): MovementPhase {
    this.elapsed = (PHASE_START[phase] + 0.002) * this.durationSec;
    this.phase = phase;
    return this.phase;
  }

  /** Advance to the next phase within this movement, or null at exhale */
  advanceToNextPhase(): MovementPhase | null {
    const n = nextPhase(this.phase);
    if (!n) return null;
    return this.jumpToPhase(n);
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

function phaseAt(p: number): MovementPhase {
  if (p < 0.18) return 'drift';
  if (p < 0.35) return 'gather';
  if (p < 0.58) return 'bloom';
  if (p < 0.72) return 'hang';
  if (p < 0.88) return 'dissolve';
  return 'exhale';
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
