import type { AppMode } from './AppMode';

const MODES: { mode: AppMode; label: string }[] = [
  { mode: 'drift', label: 'Drift' },
  { mode: 'calibrate', label: 'Calibrate' },
];

/** Two-segment Drift / Calibrate switch — lives outside the rails so it
 * stays reachable while Drift hides them. */
export class ModeToggle {
  readonly element: HTMLElement;
  private mode: AppMode;
  private readonly buttons = new Map<AppMode, HTMLButtonElement>();

  constructor(initial: AppMode, onChange: (mode: AppMode) => void) {
    this.mode = initial;
    this.element = document.createElement('div');
    this.element.className = 'mode-toggle';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', 'Playback mode');

    for (const { mode, label } of MODES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        if (this.mode === mode) return;
        this.setMode(mode);
        onChange(mode);
      });
      this.buttons.set(mode, button);
      this.element.appendChild(button);
    }
    this.syncActive();
  }

  getMode(): AppMode {
    return this.mode;
  }

  setMode(mode: AppMode): void {
    this.mode = mode;
    this.syncActive();
  }

  private syncActive(): void {
    for (const [mode, button] of this.buttons) {
      button.classList.toggle('is-active', mode === this.mode);
      button.setAttribute('aria-pressed', String(mode === this.mode));
    }
  }
}
