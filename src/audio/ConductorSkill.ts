import type { HarmonicContext, MovementPhase } from './types';

/** High-level audio directives emitted each frame, consumed by the AudioEngine. */
export interface ConductorDirectives {
  /** Session dynamics (0.2–1) scaling the whole mix. */
  masterIntensity: number;
  /** Stereo image: 0 = mono, 1 = normal, up to 1.5 = wide. */
  stereoWidth: number;
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
 * Autonomous audio creative-direction layer. Reads the shared HarmonicContext
 * and shapes session-wide intensity and stereo image to mirror the musical arc.
 * Decoupled from synthesis — emits directives the AudioEngine ramps smoothly.
 */
export class ConductorSkill {
  private intensity = 0.7;
  private width = 1;
  private elapsed = 0;

  update(ctx: HarmonicContext, dt: number): ConductorDirectives {
    this.elapsed += dt;

    // Slow session swell (~4 min period) blended with the phase ceiling.
    const swell = 0.5 + 0.5 * Math.sin((this.elapsed / 240) * Math.PI * 2 - Math.PI / 2);
    const intensityTarget = PHASE_INTENSITY[ctx.movementPhase] * (0.82 + swell * 0.18);
    this.intensity += (intensityTarget - this.intensity) * (1 - Math.exp(-dt / 6));

    const widthTarget = PHASE_WIDTH[ctx.movementPhase];
    this.width += (widthTarget - this.width) * (1 - Math.exp(-dt / 5));

    return {
      masterIntensity: this.intensity,
      stereoWidth: this.width,
    };
  }
}
