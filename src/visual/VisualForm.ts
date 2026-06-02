import type { HarmonicContext, MovementPhase } from '../audio/types';

export type VisualForm = 'network' | 'sphere' | 'waveform';

const FORM_ORDER: VisualForm[] = ['network', 'sphere', 'waveform'];

export const FORM_LABELS: Record<VisualForm, string> = {
  network: 'Network',
  sphere: 'Sphere',
  waveform: 'Waveform',
};

export function formForMovement(phase: MovementPhase, progress: number): VisualForm {
  switch (phase) {
    case 'drift':
      return 'network';
    case 'gather':
      return progress > 0.5 ? 'sphere' : 'network';
    case 'bloom':
    case 'hang':
      return 'sphere';
    case 'dissolve':
      return progress > 0.4 ? 'waveform' : 'sphere';
    case 'exhale':
      return progress > 0.55 ? 'network' : 'waveform';
  }
}

/** Picks one active form — no layering */
export class FormController {
  private current: VisualForm = 'network';
  private lastMovementIndex = -1;
  private formHold = 0;
  private readonly minHold = 8;

  update(harmonic: HarmonicContext, dt: number): VisualForm {
    const target = formForMovement(harmonic.movementPhase, harmonic.movementProgress);
    this.formHold += dt;

    if (harmonic.movementIndex !== this.lastMovementIndex) {
      this.lastMovementIndex = harmonic.movementIndex;
      this.current = target;
      this.formHold = 0;
      return this.current;
    }

    if (target !== this.current && this.formHold >= this.minHold) {
      this.current = target;
      this.formHold = 0;
    }

    return this.current;
  }

  /** Nudge form on strong musical events */
  nudgeFromAudio(harmonic: HarmonicContext): void {
    if (harmonic.surpriseFlash > 0.5) {
      const idx = FORM_ORDER.indexOf(this.current);
      this.current = FORM_ORDER[(idx + 1) % FORM_ORDER.length]!;
      this.formHold = 0;
    }
  }

  get(): VisualForm {
    return this.current;
  }

  getTarget(harmonic: HarmonicContext): VisualForm {
    return formForMovement(harmonic.movementPhase, harmonic.movementProgress);
  }

  /** Manual advance — same affordance as movement phase button */
  advance(): VisualForm {
    const idx = FORM_ORDER.indexOf(this.current);
    this.current = FORM_ORDER[(idx + 1) % FORM_ORDER.length]!;
    this.formHold = 0;
    return this.current;
  }
}
