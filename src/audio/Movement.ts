import type {
  MovementCharacter,
  MovementPhase,
  MovementScale,
  PulseProfile,
} from './types';
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
 *
 * tripleWave only appears at long/epic scale — three crests give a
 * twenty-minute piece somewhere to travel instead of one slow arc.
 */
export type MovementVariant =
  | 'classic'
  | 'doubleBloom'
  | 'longHang'
  | 'noBloom'
  | 'tripleWave';

export type { MovementCharacter, MovementScale, PulseProfile };

interface ScaleSpec {
  minSec: number;
  maxSec: number;
  weight: number;
}

const SCALE_SPECS: Record<MovementScale, ScaleSpec> = {
  fragment: { minSec: 45, maxSec: 95, weight: 0.16 },
  short: { minSec: 120, maxSec: 240, weight: 0.26 },
  standard: { minSec: 240, maxSec: 420, weight: 0.3 },
  long: { minSec: 540, maxSec: 840, weight: 0.18 },
  epic: { minSec: 1200, maxSec: 1680, weight: 0.1 },
};

export const MOVEMENT_SCALES = Object.keys(SCALE_SPECS) as MovementScale[];

/** Movements that must pass between epics, so 25 minutes stays an event. */
export const EPIC_SPACING = 3;

export interface PhaseSegment {
  phase: MovementPhase;
  start: number;
}

/**
 * A fragment can't walk six phases in ninety seconds — each would be a
 * blink. It gets a compressed 3–4 segment arc instead, one per variant so
 * the shape stays deterministic. Every one still opens on drift, contains
 * a dissolve, and closes on exhale: executeMovementSkip and
 * requestNextMovement both depend on those.
 */
function fragmentTimeline(variant: MovementVariant): PhaseSegment[] {
  switch (variant) {
    case 'doubleBloom':
      return [
        { phase: 'drift', start: 0 },
        { phase: 'gather', start: 0.14 },
        { phase: 'bloom', start: 0.34 },
        { phase: 'dissolve', start: 0.66 },
        { phase: 'exhale', start: 0.86 },
      ];
    case 'longHang':
      return [
        { phase: 'drift', start: 0 },
        { phase: 'hang', start: 0.2 },
        { phase: 'dissolve', start: 0.62 },
        { phase: 'exhale', start: 0.84 },
      ];
    case 'noBloom':
      return [
        { phase: 'drift', start: 0 },
        { phase: 'gather', start: 0.24 },
        { phase: 'dissolve', start: 0.6 },
        { phase: 'exhale', start: 0.82 },
      ];
    case 'classic':
    case 'tripleWave':
      return [
        { phase: 'drift', start: 0 },
        { phase: 'bloom', start: 0.22 },
        { phase: 'dissolve', start: 0.62 },
        { phase: 'exhale', start: 0.84 },
      ];
  }
}

export function buildTimeline(
  variant: MovementVariant,
  scale: MovementScale = 'standard',
): PhaseSegment[] {
  if (scale === 'fragment') return fragmentTimeline(variant);

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
    case 'tripleWave':
      return [
        { phase: 'drift', start: 0 },
        { phase: 'gather', start: 0.06 },
        { phase: 'bloom', start: 0.16 },
        { phase: 'hang', start: 0.26 },
        { phase: 'dissolve', start: 0.34 },
        { phase: 'gather', start: 0.4 },
        { phase: 'bloom', start: 0.5 },
        { phase: 'hang', start: 0.6 },
        { phase: 'dissolve', start: 0.68 },
        { phase: 'gather', start: 0.73 },
        { phase: 'bloom', start: 0.81 },
        { phase: 'hang', start: 0.89 },
        { phase: 'dissolve', start: 0.92 },
        { phase: 'exhale', start: 0.96 },
      ];
  }
}

const VARIANT_WEIGHTS: Record<MovementVariant, number> = {
  classic: 0.55,
  doubleBloom: 0.17,
  longHang: 0.16,
  noBloom: 0.12,
  tripleWave: 0.3,
};

function weightedDraw<T extends string>(pool: T[], weightOf: (v: T) => number): T {
  const total = pool.reduce((sum, v) => sum + weightOf(v), 0);
  let roll = Math.random() * total;
  for (const v of pool) {
    roll -= weightOf(v);
    if (roll <= 0) return v;
  }
  return pool[pool.length - 1]!;
}

/**
 * Weighted pick, never repeating the previous movement's variant.
 * tripleWave is only offered to the scales long enough to walk it.
 */
export function pickMovementVariant(
  previous: MovementVariant | null,
  scale: MovementScale = 'standard',
): MovementVariant {
  const wide = scale === 'long' || scale === 'epic';
  const pool = (Object.keys(VARIANT_WEIGHTS) as MovementVariant[]).filter(
    (v) => v !== previous && (wide || v !== 'tripleWave'),
  );
  return weightedDraw(pool, (v) => VARIANT_WEIGHTS[v]);
}

/**
 * Weighted pick over duration classes. Never repeats the previous scale, and
 * holds an epic back until enough movements have passed that arriving at one
 * still feels like arriving somewhere.
 */
export function pickMovementScale(
  previous: MovementScale | null,
  movementsSinceEpic: number,
): MovementScale {
  const epicReady = movementsSinceEpic >= EPIC_SPACING;
  const pool = MOVEMENT_SCALES.filter(
    (s) => s !== previous && (epicReady || s !== 'epic'),
  );
  return weightedDraw(pool, (s) => SCALE_SPECS[s].weight);
}

/**
 * How often a piece turns out to be a night piece. Rare enough that
 * arriving at one is a change of weather rather than the weather — and
 * never on a fragment, which has no room to establish a groove and leave.
 */
const NIGHT_CHANCE = 0.22;

export function pickMovementCharacter(
  scale: MovementScale,
  previous: MovementCharacter,
  pulseKnob: number,
): MovementCharacter {
  if (scale === 'fragment') return 'open';
  // Two night pieces back to back stop being a change of weather.
  const chance = previous === 'night' ? NIGHT_CHANCE * 0.35 : NIGHT_CHANCE;
  return Math.random() < chance * (0.5 + pulseKnob) ? 'night' : 'open';
}

/**
 * A beat is common but never the default: at rest about a third of
 * movements carry none, a quarter take the felt-not-heard heartbeat, and
 * the rest get a full kit. Tempo steers it hard — from a kit on a fifth of
 * movements at the bottom of the knob to half of them at the top — with
 * Density nudging alongside. A fragment never gets a kit: there isn't room
 * to establish a pattern and leave again.
 */
export function pickPulseProfile(
  scale: MovementScale,
  pulseKnob: number,
  activityKnob: number,
  character: MovementCharacter = 'open',
): PulseProfile {
  // A night piece is the 2-step. There is no silent version of one.
  if (character === 'night') return 'kit';
  const kitAllowed = scale !== 'fragment';
  const weights: Record<PulseProfile, number> = {
    silent: 0.4,
    felt: 0.26 * (0.7 + pulseKnob * 0.6),
    kit: kitAllowed ? 0.34 * (0.25 + pulseKnob * 1.5 + activityKnob * 0.6) : 0,
  };
  const pool = (Object.keys(weights) as PulseProfile[]).filter((p) => weights[p] > 0);
  return weightedDraw(pool, (p) => weights[p]);
}

/**
 * Dev-only duration override — a twenty-five minute movement can't be
 * verified by waiting for one. `?scale=epic` forces every movement to a
 * scale so fragments, epics and doorway crossings are all reachable in a
 * single session. Absent in tests (no window) and in normal use.
 */
export function readScaleOverride(): MovementScale | null {
  return readOverride('scale', MOVEMENT_SCALES);
}

/**
 * Dev-only pulse override — `?pulse=kit`. Half of movements draw a silent
 * profile and a fragment never gets a kit, so without this the beat is hard
 * to reach on purpose.
 */
export function readPulseOverride(): PulseProfile | null {
  return readOverride('pulse', PULSE_PROFILES);
}

/**
 * Dev-only character override — `?character=night`. Night pieces are a
 * minority draw by design, so this is how you reach one on purpose.
 */
export function readCharacterOverride(): MovementCharacter | null {
  return readOverride('character', MOVEMENT_CHARACTERS);
}

const PULSE_PROFILES: PulseProfile[] = ['silent', 'felt', 'kit'];
export const MOVEMENT_CHARACTERS: MovementCharacter[] = ['open', 'night'];

function readOverride<T extends string>(key: string, allowed: readonly T[]): T | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get(key);
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

/** One generative "song" — anywhere from a 45-second fragment to 28 minutes. */
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
    readonly scale: MovementScale = 'standard',
    readonly pulseProfile: PulseProfile = 'silent',
    readonly character: MovementCharacter = 'open',
  ) {
    this.index = index;
    this.timeline = buildTimeline(variant, scale);

    // Multi-crest arcs lean toward the upper end of their class — they have
    // more ground to cover before the last dissolve.
    const spec = SCALE_SPECS[scale];
    const lean =
      variant === 'tripleWave' ? 0.4 : variant === 'doubleBloom' ? 0.25 : variant === 'longHang' ? 0.15 : 0;
    const t = lean + Math.random() * (1 - lean);
    this.durationSec = spec.minSec + t * (spec.maxSec - spec.minSec);
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

  /**
   * How long the harmonic crossfade into the next movement should run.
   * A flat 25s would eat half a fragment and pass unnoticed in an epic.
   */
  transitionSec(): number {
    return Math.max(8, Math.min(40, this.durationSec * 0.07));
  }

  /** How long the dissolve bridge runs before a requested movement skip. */
  dissolveBridgeSec(): number {
    return Math.max(4, Math.min(14, this.durationSec * 0.03));
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
