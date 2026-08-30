import type { MovementScale } from './types';

/**
 * The walk between two rooms.
 *
 * At Paradiso you could hear one set per room, but the transition spaces
 * blurred them — you swam out of one atmosphere and into another, and the
 * sound faded in and out of consciousness at the threshold. This tracks how
 * far the listener has drifted toward the room next door: mostly resting
 * inside one, sometimes leaning into the doorway and coming back, and
 * sometimes going far enough through that the rooms trade places.
 *
 * An excursion always returns to 0. Walking "into" the other room is not a
 * position — it is the doorway event, fired at the point of deepest blur,
 * where the engine hands the neighbour's key to the main room and gives the
 * neighbour a new one. Swapping there means the change happens inside the
 * smear rather than as a cut between two clear atmospheres.
 *
 * Pure state, no audio — the engine reads the emitted gains, cutoffs and
 * sends and applies them.
 */

/** How a single room sounds from where the listener is standing. */
export interface RoomAudibility {
  gain: number;
  /** Lowpass corner, Hz — a wall away is muffled, in the room is open. */
  cutoff: number;
  /** Reverb send — distance reads as more room, less source. */
  reverbSend: number;
}

export interface RoomState {
  /** 0 = settled in this room, 1 = as far into the next one as the walk goes. */
  position: number;
  /** Threshold presence, peaking at 0.5 where both rooms bleed together. */
  corridor: number;
  here: RoomAudibility;
  next: RoomAudibility;
  /** True only on the frame the walk crosses the threshold outbound. */
  doorway: boolean;
}

export type Rng = () => number;

/** Seconds between excursions, per movement length. */
const REST_RANGE: Record<MovementScale, readonly [number, number]> = {
  fragment: [999, 999], // too short to wander; only the forced crossing fires
  short: [90, 180],
  standard: [70, 150],
  long: [50, 110],
  epic: [40, 90],
};

/** A wall away, and standing in it. */
const CUTOFF_FAR = 400;
const CUTOFF_NEAR = 18000;
const SEND_FAR = 0.55;
const SEND_NEAR = 0.12;

/** How often an excursion turns back short of the threshold. */
const PEEK_CHANCE = 0.4;

/** The threshold. Crossing it outbound is what trades the rooms. */
export const THRESHOLD = 0.5;

type WalkPhase = 'resting' | 'outbound' | 'returning';

export class RoomWalk {
  private position = 0;
  private phase: WalkPhase = 'resting';
  /** How far this excursion goes. A peek stays short of the threshold. */
  private apex = 0;
  private rate = 1 / 40;
  private restTimer: number;
  private doorwayFired = false;
  private crossedThisTrip = false;
  private scale: MovementScale = 'standard';

  constructor(private readonly rng: Rng = Math.random) {
    this.restTimer = this.drawRest();
  }

  /**
   * Called as each movement begins. A rest interval drawn under the previous
   * movement's scale has to be redrawn, or a fragment inherits a standard
   * movement's much shorter interval and wanders off on its own when the
   * only crossing it should make is the one the engine forces.
   */
  setScale(scale: MovementScale): void {
    if (scale === this.scale) return;
    this.scale = scale;
    if (this.phase === 'resting') this.restTimer = this.drawRest();
  }

  getPosition(): number {
    return this.position;
  }

  isExcursion(): boolean {
    return this.phase !== 'resting';
  }

  /**
   * Send the listener toward the doorway now, if they aren't already on
   * their way. The engine calls this as a movement runs out, so the crossing
   * *is* the boundary between pieces rather than an event laid over one.
   */
  forceCrossing(): void {
    if (this.phase === 'outbound') {
      // Already heading out — make sure it goes far enough to count.
      this.apex = Math.max(this.apex, 0.84);
      return;
    }
    if (this.phase === 'returning') return;
    this.beginExcursion(false);
  }

  update(dt: number): RoomState {
    this.doorwayFired = false;

    switch (this.phase) {
      case 'resting':
        this.restTimer -= dt;
        if (this.restTimer <= 0) {
          this.beginExcursion(this.rng() < PEEK_CHANCE);
        } else {
          // Never quite still: a slow lean toward and away from the wall.
          const wander = (this.rng() - 0.5) * dt * 0.02;
          this.position = clamp01(
            this.position - this.position * (1 - Math.exp(-dt / 12)) + wander,
          );
        }
        break;

      case 'outbound': {
        this.position = clamp01(this.position + this.rate * dt);
        if (!this.crossedThisTrip && this.position >= THRESHOLD) {
          this.crossedThisTrip = true;
          this.doorwayFired = true;
        }
        if (this.position >= this.apex) {
          this.position = this.apex;
          this.phase = 'returning';
        }
        break;
      }

      case 'returning':
        this.position = clamp01(this.position - this.rate * dt);
        if (this.position <= 0.01) {
          this.position = 0;
          this.phase = 'resting';
          this.crossedThisTrip = false;
          this.restTimer = this.drawRest();
        }
        break;
    }

    return this.buildState();
  }

  private beginExcursion(peek: boolean): void {
    this.phase = 'outbound';
    this.crossedThisTrip = false;
    // A peek stays strictly short of the threshold, so it can never trade
    // the rooms — you leaned out, heard the other set, and came back.
    this.apex = peek ? 0.3 + this.rng() * 0.16 : 0.8 + this.rng() * 0.14;
    // 25–60s each way: the corridor has to be somewhere you spend time,
    // not a cut between two rooms.
    this.rate = 1 / (25 + this.rng() * 35);
  }

  private drawRest(): number {
    const [lo, hi] = REST_RANGE[this.scale];
    return lo + this.rng() * (hi - lo);
  }

  private buildState(): RoomState {
    const position = this.position;
    const corridor = 1 - Math.abs(2 * position - 1);
    return {
      position,
      corridor,
      here: audibility(1 - position, corridor),
      next: audibility(position, corridor),
      doorway: this.doorwayFired,
    };
  }
}

/**
 * How present a room is, given how close the listener is to it. In the
 * threshold both rooms lose their edges — everything smears together, which
 * is the part that made the transition spaces beautiful rather than messy.
 */
export function audibility(presence: number, corridor: number): RoomAudibility {
  const p = clamp01(presence);
  // Slightly concave, so a room next door is audible well before you reach it.
  const shaped = Math.pow(p, 0.7);
  const cutoff = CUTOFF_FAR * Math.pow(CUTOFF_NEAR / CUTOFF_FAR, shaped);
  const send = SEND_FAR + (SEND_NEAR - SEND_FAR) * shaped;
  return {
    gain: shaped,
    cutoff: cutoff * (1 - 0.45 * corridor),
    reverbSend: Math.min(0.9, send + 0.25 * corridor),
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
