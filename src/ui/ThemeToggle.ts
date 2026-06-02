import type { SceneTheme } from '../visual/ScenePalette';

const STORAGE_KEY = 'ao-theme';

export class ThemeToggle {
  readonly element: HTMLButtonElement;
  private theme: SceneTheme;
  private readonly onChange: (theme: SceneTheme) => void;

  constructor(initial: SceneTheme, onChange: (theme: SceneTheme) => void) {
    this.theme = initial;
    this.onChange = onChange;

    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = 'theme-toggle';
    this.element.setAttribute('aria-label', 'Toggle light and dark field');
    this.syncLabel();
    this.element.addEventListener('click', () => this.toggle());
  }

  getTheme(): SceneTheme {
    return this.theme;
  }

  setTheme(theme: SceneTheme): void {
    this.theme = theme;
    this.syncLabel();
  }

  private toggle(): void {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    try {
      localStorage.setItem(STORAGE_KEY, this.theme);
    } catch {
      /* private browsing */
    }
    this.syncLabel();
    this.onChange(this.theme);
  }

  private syncLabel(): void {
    this.element.textContent = this.theme === 'light' ? 'Dark field' : 'Light field';
  }
}
