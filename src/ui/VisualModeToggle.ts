import {
  storeVisualMode,
  VISUAL_MODES,
  VISUAL_MODE_LABELS,
  type VisualMode,
} from '../visual/VisualMode';

/**
 * Ink / Currents / Resonance.
 *
 * A segmented group rather than the cycling button it was with two modes:
 * a button labelled with its destination is fine for a pair and useless for
 * three, where it can only ever name one of the two places you might be
 * going. Same shape as the Drift/Calibrate/Play switch, at the other end of
 * the screen — what you are looking at above, what the engine is doing
 * below.
 */
export class VisualModeToggle {
  readonly element: HTMLElement;
  private mode: VisualMode;
  private readonly buttons = new Map<VisualMode, HTMLButtonElement>();

  constructor(initial: VisualMode, onChange: (mode: VisualMode) => void) {
    this.mode = initial;
    this.element = document.createElement('div');
    this.element.className = 'mode-toggle';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', 'Visual mode');

    for (const mode of VISUAL_MODES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = VISUAL_MODE_LABELS[mode];
      button.addEventListener('click', () => {
        if (this.mode === mode) return;
        this.mode = mode;
        storeVisualMode(mode);
        this.syncActive();
        onChange(mode);
      });
      this.buttons.set(mode, button);
      this.element.appendChild(button);
    }
    this.syncActive();
  }

  getMode(): VisualMode {
    return this.mode;
  }

  private syncActive(): void {
    for (const [mode, button] of this.buttons) {
      const active = mode === this.mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }
}
