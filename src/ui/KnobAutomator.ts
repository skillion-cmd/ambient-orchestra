import type { AppKnobs, HarmonicContext } from '../audio/types';
import { DEFAULT_KNOBS } from '../audio/types';

type SoundKey = keyof AppKnobs['sound'];
type VisualKey = keyof AppKnobs['visual'];

interface KnobTarget {
  section: 'sound' | 'visual';
  key: SoundKey | VisualKey;
}

function clamp(v: number, lo = 0.18, hi = 0.82): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Slowly drifts knob values — orbits user anchor, respects manual control */
export class KnobAutomator {
  private knobs: AppKnobs = {
    sound: { ...DEFAULT_KNOBS.sound },
    visual: { ...DEFAULT_KNOBS.visual },
  };
  private targets: AppKnobs = {
    sound: { ...DEFAULT_KNOBS.sound },
    visual: { ...DEFAULT_KNOBS.visual },
  };
  private anchors: AppKnobs = {
    sound: { ...DEFAULT_KNOBS.sound },
    visual: { ...DEFAULT_KNOBS.visual },
  };
  /** Bar index of the last cluster shift; transitions lock to phrase boundaries. */
  private lastShiftBar = 0;
  /** Phrase length until the next shift (8 or 16 bars). */
  private barsUntilShift = 8;
  /** Sweep time-constant in seconds — gentle/quick/slow character per cluster. */
  private sweepTau = 10;
  /** Drift mode: no user anchor to respect — roam the full clamp range. */
  private fullAuto = false;

  setFullAuto(fullAuto: boolean): void {
    this.fullAuto = fullAuto;
  }

  getKnobs(): AppKnobs {
    return {
      sound: { ...this.knobs.sound },
      visual: { ...this.knobs.visual },
    };
  }

  setKnobs(knobs: AppKnobs): void {
    this.knobs = {
      sound: { ...knobs.sound },
      visual: { ...knobs.visual },
    };
    this.targets = {
      sound: { ...knobs.sound },
      visual: { ...knobs.visual },
    };
    this.anchors = {
      sound: { ...knobs.sound },
      visual: { ...knobs.visual },
    };
  }

  /** Call when user adjusts a knob manually */
  syncFromUser(knobs: AppKnobs): void {
    this.knobs = {
      sound: { ...knobs.sound },
      visual: { ...knobs.visual },
    };
    this.targets = {
      sound: { ...knobs.sound },
      visual: { ...knobs.visual },
    };
    this.anchors = {
      sound: { ...knobs.sound },
      visual: { ...knobs.visual },
    };
  }

  update(dt: number, harmonic: HarmonicContext, userDragging: boolean): AppKnobs {
    if (userDragging) return this.getKnobs();

    const moveRate = 1 - Math.exp(-dt / this.sweepTau);

    for (const key of Object.keys(this.knobs.sound) as SoundKey[]) {
      this.knobs.sound[key] = lerp(this.knobs.sound[key], this.targets.sound[key], moveRate);
    }
    for (const key of Object.keys(this.knobs.visual) as VisualKey[]) {
      this.knobs.visual[key] = lerp(this.knobs.visual[key], this.targets.visual[key], moveRate);
    }

    // Lock cluster transitions to 8/16-bar phrase boundaries — creates audible
    // "sections" rather than arrhythmic drift.
    if (harmonic.currentBar >= this.lastShiftBar + this.barsUntilShift) {
      this.shiftTargets(harmonic);
      this.lastShiftBar = harmonic.currentBar;
      this.barsUntilShift = Math.random() < 0.5 ? 8 : 16;
      // Sweep character: gentle drift, quick flick, or slow arc.
      const roll = Math.random();
      this.sweepTau = roll < 0.5 ? 10 : roll < 0.8 ? 3.5 : 18;
    }

    return this.getKnobs();
  }

  private shiftTargets(harmonic: HarmonicContext): void {
    // Coordinated cluster: 2–3 knobs move together in the same direction.
    const picks = this.pickKnobs(2 + Math.floor(Math.random() * 2));
    const phase = harmonic.movementPhase;
    const orbit = this.fullAuto ? 0.17 : 0.08;
    const dir = Math.random() < 0.5 ? -1 : 1;

    for (const pick of picks) {
      const span = dir * orbit * (0.5 + Math.random() * 0.5);
      if (pick.section === 'sound') {
        const key = pick.key as SoundKey;
        let base = this.anchors.sound[key] + span;
        if (this.fullAuto) {
          // Walk the anchor along so a session explores the whole range
          // instead of orbiting the boot defaults forever.
          this.anchors.sound[key] = clamp(lerp(this.anchors.sound[key], base, 0.35));
        }

        if (key === 'activity' && (phase === 'bloom' || phase === 'gather')) base += 0.1;
        if (key === 'memory' && (phase === 'bloom' || phase === 'hang')) base += 0.12;
        if (key === 'entropy' && phase === 'dissolve') base += 0.1;
        if (key === 'warmth' && phase === 'bloom') base += 0.05;
        if (key === 'foundation' && (phase === 'bloom' || phase === 'hang')) base += 0.08;
        if (key === 'width' && phase === 'bloom') base += 0.08;
        if (key === 'width' && (phase === 'drift' || phase === 'exhale')) base -= 0.08;
        if (key === 'texture' && (phase === 'dissolve' || phase === 'exhale')) base += 0.08;

        this.targets.sound[key] = clamp(base);
      } else {
        const key = pick.key as VisualKey;
        let base = this.anchors.visual[key] + span;
        if (this.fullAuto) {
          this.anchors.visual[key] = clamp(lerp(this.anchors.visual[key], base, 0.35));
        }

        if (key === 'ripple' && (phase === 'bloom' || harmonic.beatPulse > 0.5)) {
          base += 0.08;
        }
        if (key === 'drift' && phase === 'drift') base += 0.08;
        if (key === 'grain' && harmonic.ensemblePulse > 0.3) base += 0.07;
        if (key === 'focus' && phase === 'bloom') base += 0.12;
        if (key === 'focus' && phase === 'drift') base -= 0.1;
        if (key === 'trails' && (phase === 'drift' || phase === 'dissolve')) base += 0.06;
        // Blooms clear the air — mirrors the art director's fog retreat.
        if (key === 'fog' && phase === 'bloom') base -= 0.08;
        if (key === 'fog' && phase === 'exhale') base += 0.08;

        this.targets.visual[key] = clamp(base);
      }
    }
  }

  private pickKnobs(count: number): KnobTarget[] {
    const all: KnobTarget[] = [
      { section: 'sound', key: 'warmth' },
      { section: 'sound', key: 'space' },
      { section: 'sound', key: 'activity' },
      { section: 'sound', key: 'memory' },
      { section: 'sound', key: 'entropy' },
      { section: 'sound', key: 'foundation' },
      { section: 'sound', key: 'width' },
      { section: 'sound', key: 'texture' },
      { section: 'visual', key: 'grain' },
      { section: 'visual', key: 'ripple' },
      { section: 'visual', key: 'drift' },
      { section: 'visual', key: 'focus' },
      { section: 'visual', key: 'trails' },
      { section: 'visual', key: 'fog' },
    ];
    // Tempo only self-drives when the piece is fully autonomous.
    if (this.fullAuto) all.push({ section: 'sound', key: 'pulse' });
    const shuffled = all.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }
}
