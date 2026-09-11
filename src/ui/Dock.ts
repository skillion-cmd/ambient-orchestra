import type { AppMode } from './AppMode';
import { DOCK_PANEL_LABELS, panelForMode, panelsForMode, type DockPanelId } from './DockPanel';

/**
 * Below this width two 268px rails plus a usable field in between do not fit,
 * so the rails stop being rails and become one bottom sheet with tabs. It is a
 * width test rather than a touch test on purpose: a narrow desktop window has
 * exactly the same problem, and a touchscreen laptop does not have it at all.
 */
const COMPACT_QUERY = '(max-width: 820px)';

export interface DockHandlers {
  /** Fired when the layout crosses the breakpoint, and once on construction. */
  onCompactChange(compact: boolean): void;
  /**
   * Fired whenever the sheet's height may have changed — a mode change, a
   * tab, a collapse, the breakpoint. The field behind it reads this to know
   * how much of the screen it still has.
   */
  onLayoutChange(): void;
}

/**
 * The phone layout's controller.
 *
 * It owns three pieces of state that only mean anything in the compact
 * layout — which panel is showing, whether the sheet is collapsed, and
 * whether we are compact at all — and publishes all three as data attributes
 * on `<body>` so the stylesheet can do the actual work. Nothing here moves a
 * node: both layouts are the same DOM.
 */
export class Dock {
  private readonly media = window.matchMedia(COMPACT_QUERY);
  private readonly tabButtons = new Map<DockPanelId, HTMLButtonElement>();
  private mode: AppMode;
  private panel: DockPanelId | null;
  private collapsed = false;

  constructor(
    private readonly bar: HTMLElement,
    private readonly tabs: HTMLElement,
    private readonly collapseButton: HTMLButtonElement,
    initialMode: AppMode,
    private readonly handlers: DockHandlers,
  ) {
    this.mode = initialMode;
    this.panel = panelForMode(initialMode, null);

    this.collapseButton.addEventListener('click', () => this.setCollapsed(!this.collapsed));
    this.media.addEventListener('change', () => {
      this.syncCompact();
      this.handlers.onCompactChange(this.media.matches);
    });

    this.syncCompact();
    this.render();
    this.handlers.onCompactChange(this.media.matches);
  }

  /** True while the bottom-sheet layout is the one on screen. */
  isCompact(): boolean {
    return this.media.matches;
  }

  setMode(mode: AppMode): void {
    this.mode = mode;
    this.panel = panelForMode(mode, this.panel);
    // A mode you switched into deliberately is a mode you want to see.
    if (this.panel) this.collapsed = false;
    this.render();
  }

  setPanel(panel: DockPanelId): void {
    if (!panelsForMode(this.mode).includes(panel)) return;
    this.panel = panel;
    this.collapsed = false;
    this.render();
  }

  toggleCollapsed(): void {
    this.setCollapsed(!this.collapsed);
  }

  private setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.render();
  }

  private syncCompact(): void {
    document.body.dataset.layout = this.media.matches ? 'compact' : 'wide';
  }

  private render(): void {
    const panels = panelsForMode(this.mode);

    // Drift has nothing to tab between, so the bar goes rather than standing
    // there empty — the same decision the rails already make in Drift.
    this.bar.classList.toggle('is-empty', panels.length === 0);

    for (const id of panels) {
      let button = this.tabButtons.get(id);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.dataset.panel = id;
        button.textContent = DOCK_PANEL_LABELS[id];
        button.setAttribute('role', 'tab');
        button.addEventListener('click', () => this.setPanel(id));
        this.tabButtons.set(id, button);
      }
      button.hidden = false;
      // Re-appending an element that is already in place is a no-op move, so
      // this keeps the tabs in mode order without rebuilding them.
      this.tabs.appendChild(button);
    }
    for (const [id, button] of this.tabButtons) {
      const shown = panels.includes(id);
      button.hidden = !shown;
      const active = shown && id === this.panel;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    }

    if (this.panel) document.body.dataset.panel = this.panel;
    else delete document.body.dataset.panel;
    document.body.dataset.dock = this.collapsed ? 'collapsed' : 'open';

    this.collapseButton.textContent = this.collapsed ? 'Show' : 'Hide';
    this.collapseButton.setAttribute('aria-expanded', String(!this.collapsed));
    this.collapseButton.setAttribute(
      'aria-label',
      this.collapsed ? 'Show the controls' : 'Hide the controls',
    );

    this.handlers.onLayoutChange();
  }
}
