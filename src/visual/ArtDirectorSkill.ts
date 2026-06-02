import type { AudioFeatures, HarmonicContext, MovementPhase } from '../audio/types';

/** High-level visual directives emitted each frame, consumed by the Visualizer. */
export interface ArtDirectorDirectives {
  /** Multiplier on the ghost fog density (1 = neutral). */
  fogMultiplier: number;
  /** Additive offset applied to the Focus knob before layer balance (-0.4..0.4). */
  focusOffset: number;
  /** Palette mood: -1 = cool/blue-violet, +1 = warm/amber. */
  moodBlend: number;
  /** True on the frame a constellation moment should begin. */
  constellationTrigger: boolean;
}

interface PhaseProfile {
  fog: number;
  focusBias: number;
}

/** Per-phase resting targets the director eases toward. */
const PHASE_PROFILES: Record<MovementPhase, PhaseProfile> = {
  drift: { fog: 0.82, focusBias: -0.18 },
  gather: { fog: 1.12, focusBias: 0.12 },
  bloom: { fog: 0.74, focusBias: 0.22 },
  hang: { fog: 1.2, focusBias: 0.0 },
  dissolve: { fog: 1.05, focusBias: -0.08 },
  exhale: { fog: 1.15, focusBias: -0.22 },
};

/**
 * Autonomous visual creative-direction layer. Reads the shared HarmonicContext
 * and audio features, and shapes fog, focus, palette mood, and constellation
 * moments to mirror the musical arc. Decoupled from rendering — emits directives.
 */
export class ArtDirectorSkill {
  private fog = 1;
  private focusOffset = 0;
  private mood = 0;
  private oscPhase = Math.random() * Math.PI * 2;
  private oscPeriod = 45;
  private focusSnap = 0;
  private lastGestureId = -1;
  private lastCadence = 0;
  private lastPhase: MovementPhase | null = null;
  private constellationCooldown = 0;

  update(ctx: HarmonicContext, features: AudioFeatures, dt: number): ArtDirectorDirectives {
    const profile = PHASE_PROFILES[ctx.movementPhase];
    const ease = 1 - Math.exp(-dt / 3.5);

    // Fog eases toward the phase target, with a touch of breathing from audio.
    const fogTarget = profile.fog * (1 - features.overall * 0.12);
    this.fog += (fogTarget - this.fog) * ease;

    // Dreamlike focus: a slow sine oscillation around the phase bias, plus
    // event-triggered snaps that drift back over a few seconds.
    this.oscPhase += (dt * Math.PI * 2) / this.oscPeriod;
    const osc = Math.sin(this.oscPhase) * 0.12;

    const ensembleSnap = ctx.gestureId !== this.lastGestureId && ctx.ensemblePulse > 0.4;
    const cadenceSnap = ctx.cadenceRipple > 0.65 && this.lastCadence <= 0.35;
    if (ensembleSnap || cadenceSnap) {
      this.focusSnap = (ensembleSnap ? 0.28 : 0.2) * (Math.random() > 0.5 ? 1 : -1);
      this.oscPeriod = 30 + Math.random() * 60;
    }
    this.lastGestureId = ctx.gestureId;
    this.lastCadence = ctx.cadenceRipple;
    this.focusSnap *= Math.exp(-dt / 5); // drift back over ~5s

    const focusTarget = profile.focusBias + osc + this.focusSnap;
    this.focusOffset += (focusTarget - this.focusOffset) * ease;

    // Palette mood from harmony: dominant/color tension cools, tonic warms;
    // brightness nudges warmer. (-1 cool .. +1 warm)
    let moodTarget = 0;
    switch (ctx.chordFunction) {
      case 'tonic':
        moodTarget = 0.45;
        break;
      case 'subdominant':
        moodTarget = 0.1;
        break;
      case 'dominant':
        moodTarget = -0.35;
        break;
      case 'color':
        moodTarget = -0.5;
        break;
    }
    moodTarget += (ctx.brightness - 0.5) * 0.4;
    this.mood += (Math.max(-1, Math.min(1, moodTarget)) - this.mood) * (1 - Math.exp(-dt / 6));

    // Constellation moments: fire on entering bloom, throttled.
    this.constellationCooldown = Math.max(0, this.constellationCooldown - dt);
    let constellationTrigger = false;
    if (
      ctx.movementPhase === 'bloom' &&
      this.lastPhase !== 'bloom' &&
      this.constellationCooldown <= 0
    ) {
      constellationTrigger = true;
      this.constellationCooldown = 40;
    }
    this.lastPhase = ctx.movementPhase;

    return {
      fogMultiplier: this.fog,
      focusOffset: this.focusOffset,
      moodBlend: this.mood,
      constellationTrigger,
    };
  }
}
