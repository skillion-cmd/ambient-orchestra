import { storeVisualMode, type VisualMode } from '../visual/VisualMode';

/** Field / Currents switch — sibling of the theme toggle in the right rail. */
export class VisualModeToggle {
  readonly element: HTMLButtonElement;
  private mode: VisualMode;
  private readonly onChange: (mode: VisualMode) => void;

  constructor(initial: VisualMode, onChange: (mode: VisualMode) => void) {
    this.mode = initial;
    this.onChange = onChange;

    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = 'theme-toggle';
    this.element.setAttribute('aria-label', 'Toggle field and currents visuals');
    this.syncLabel();
    this.element.addEventListener('click', () => this.toggle());
  }

  getMode(): VisualMode {
    return this.mode;
  }

  private toggle(): void {
    this.mode = this.mode === 'field' ? 'currents' : 'field';
    storeVisualMode(this.mode);
    this.syncLabel();
    this.onChange(this.mode);
  }

  /** Label names the destination, matching the theme toggle's convention. */
  private syncLabel(): void {
    this.element.textContent = this.mode === 'field' ? 'Currents' : 'Ink field';
  }
}
