import type { AppMode } from './AppMode';

/**
 * Which panel the phone dock is showing.
 *
 * On a wide screen every panel is on screen at once — audio down the left,
 * visual down the right, the instrument in the middle. A phone has room for
 * one, so the same three become tabs, and the tab set depends on the mode:
 * Drift shows none (it is the hands-off mode and hides its controls on every
 * screen size), Calibrate has the two rails, Play adds the instrument.
 */
export type DockPanelId = 'audio' | 'visual' | 'play';

export const DOCK_PANEL_LABELS: Record<DockPanelId, string> = {
  play: 'Play',
  audio: 'Audio',
  visual: 'Visual',
};

/** The tabs a mode offers, in display order. Drift offers none. */
export function panelsForMode(mode: AppMode): DockPanelId[] {
  switch (mode) {
    case 'drift':
      return [];
    case 'play':
      // The instrument first: in Play it is the thing you came for, and the
      // rails are the engine behind it.
      return ['play', 'audio', 'visual'];
    case 'calibrate':
      return ['audio', 'visual'];
  }
}

/**
 * Which panel to show after a mode change.
 *
 * Entering Play always lands on the instrument rather than wherever you left
 * the tabs — switching to Play is asking for the keyboard. Leaving it keeps
 * the rail you were on, unless that rail was the instrument, which no longer
 * exists.
 */
export function panelForMode(mode: AppMode, current: DockPanelId | null): DockPanelId | null {
  if (mode === 'drift') return null;
  if (mode === 'play') return 'play';
  return current && current !== 'play' ? current : 'audio';
}
