import type { HarmonicContext, MovementPhase, MovementScale } from './types';
import {
  focusPointAt,
  presenceAt,
  NEUTRAL_PRESENCE,
  type LayerPresence,
} from './LayerPresence';

/** High-level audio directives emitted each frame, consumed by the AudioEngine. */
export interface ConductorDirectives {
  /** Session dynamics (0.2–1) scaling the whole mix. */
  masterIntensity: number;
  /** Stereo image: 0 = mono, 1 = normal, up to 1.5 = wide. */
  stereoWidth: number;
  /** Which layer holds the foreground — multiplies the knob-set bus gains. */
  layerPresence: LayerPresence;
}

/** Per-phase stereo width — intimate in drift/exhale, enveloping in bloom/hang. */
const PHASE_WIDTH: Record<MovementPhase, number> = {
  drift: 0.55,
  gather: 0.95,
  bloom: 1.4,
  hang: 1.3,
  dissolve: 0.85,
  exhale: 0.45,
};

/** Per-phase intensity ceiling the session arc is shaped against. */
const PHASE_INTENSITY: Record<MovementPhase, number> = {
  drift: 0.62,
  gather: 0.78,
  bloom: 0.95,
  hang: 0.88,
  dissolve: 0.72,
  exhale: 0.55,
};

/**
 * How far below its phase ceiling the swell is allowed to pull the mix.
 * A fragment barely breathes — there isn't time. A long piece needs the
 * room to recede almost to nothing and come back.
 */
const SWELL_DEPTH: Record<MovementScale, number> = {
  fragment: 0.08,
  short: 0.16,
  standard: 0.24,
  long: 0.42,
  epic: 0.55,
};

/**
 * How much the foreground rotation is stretched. A fragment turns over
 * once; an epic wanders slowly enough that you notice the layer in front
 * has changed without catching it change.
 */
const ROTATION_SCALE: Record<MovementScale, number> = {
  fragment: 0.35,
  short: 0.6,
  standard: 1,
  long: 1.4,
  epic: 1.9,
};

/** Only long-form movements get the near-silence dips. */
const DIP_SCALES: MovementScale[] = ['long', 'epic'];

/**
 * Autonomous audio creative-direction layer. Reads the shared HarmonicContext
 * and shapes session-wide intensity, stereo image and foreground balance to
 * mirror the musical arc. Decoupled from synthesis — emits directives the
 * AudioEngine ramps smoothly.
 */
export class ConductorSkill {
  private intensity = 0.7;
  private width = 1;
  private elapsed = 0;
  private presence: LayerPresence = { ...NEUTRAL_PRESENCE };
  private driftX = 0;
  private driftY = 0;
  /** Depth of a running near-silence dip (0 = none). */
  private dip = 0;
  private dipHold = 0;
  private nextDipIn = 180 + Math.random() * 240;

  update(ctx: HarmonicContext, dt: number): ConductorDirectives {
    this.elapsed += dt;

    const scale = ctx.movementScale;

    // Session swell, its period taken from the movement so a fragment gets
    // one breath and a quarter-hour piece gets three or four.
    const period = Math.max(45, Math.min(420, ctx.movementDurationSec / 3));
    const swell = 0.5 + 0.5 * Math.sin((this.elapsed / period) * Math.PI * 2 - Math.PI / 2);
    const depth = SWELL_DEPTH[scale];
    const dipped = this.updateDip(scale, dt);
    const intensityTarget =
      PHASE_INTENSITY[ctx.movementPhase] * (1 - depth * (1 - swell)) * dipped;
    this.intensity += (intensityTarget - this.intensity) * (1 - Math.exp(-dt / 6));

    const widthTarget = PHASE_WIDTH[ctx.movementPhase];
    this.width += (widthTarget - this.width) * (1 - Math.exp(-dt / 5));

    this.updatePresence(scale, dt, ctx.pulseProfile === 'silent');

    return {
      masterIntensity: this.intensity,
      stereoWidth: this.width,
      layerPresence: { ...this.presence },
    };
  }

  /**
   * A rare, slow collapse most of the way to silence and back — the moment
   * the room empties out. Long-form only: in a two-minute piece it would
   * read as a dropout rather than a held breath.
   */
  private updateDip(scale: MovementScale, dt: number): number {
    if (!DIP_SCALES.includes(scale)) {
      this.dip = Math.max(0, this.dip - dt / 20);
      return 1 - this.dip * 0.6;
    }

    this.nextDipIn -= dt;
    if (this.nextDipIn <= 0 && this.dip <= 0 && this.dipHold <= 0) {
      this.dipHold = 10 + Math.random() * 14;
      this.nextDipIn = 240 + Math.random() * 360;
    }

    if (this.dipHold > 0) {
      this.dipHold -= dt;
      this.dip = Math.min(1, this.dip + dt / 12); // fall away over ~12s
    } else {
      this.dip = Math.max(0, this.dip - dt / 22); // return over ~22s
    }

    return 1 - this.dip * 0.6;
  }

  /**
   * Walk the focus point. A slow random drift rides on top of the fixed
   * sinusoids so the rotation never settles into a recognisable loop.
   */
  private updatePresence(scale: MovementScale, dt: number, pulseSilent: boolean): void {
    const tau = 90;
    this.driftX += (-this.driftX * dt) / tau + (Math.random() - 0.5) * dt * 0.06;
    this.driftY += (-this.driftY * dt) / tau + (Math.random() - 0.5) * dt * 0.06;

    const point = focusPointAt(this.elapsed, ROTATION_SCALE[scale], [
      this.driftX,
      this.driftY,
    ]);
    const target = presenceAt(point, 0.8, { pulse: pulseSilent });

    // Ease so a knob-set bus gain never steps; the ramp in the engine is
    // short, and this is what keeps the movement gradual.
    const ease = 1 - Math.exp(-dt / 4);
    for (const layer of Object.keys(target) as (keyof LayerPresence)[]) {
      this.presence[layer] += (target[layer] - this.presence[layer]) * ease;
    }
  }
}
