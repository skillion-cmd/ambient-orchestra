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
export type DockPanelId = 'audio' | 'visual' | 'play' | 'kit' | 'stage';

export const DOCK_PANEL_LABELS: Record<DockPanelId, string> = {
  play: 'Play',
  kit: 'Kit',
  stage: 'Stage',
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
    case 'kit':
      return ['kit', 'audio', 'visual'];
    case 'stage':
      return ['stage', 'audio', 'visual'];
    case 'calibrate':
      return ['audio', 'visual'];
  }
}

/** The panel a mode brings with it, if it has one of its own. */
function ownPanel(mode: AppMode): DockPanelId | null {
  return mode === 'play' || mode === 'kit' || mode === 'stage' ? mode : null;
}

/**
 * Which panel to show after a mode change.
 *
 * A mode with a panel of its own always lands on it rather than on wherever
 * you left the tabs — switching to Play is asking for the keyboard, switching
 * to Kit is asking for the grid. Leaving one keeps the rail you were on,
 * unless that rail was another mode's panel, which is no longer on offer.
 */
export function panelForMode(mode: AppMode, current: DockPanelId | null): DockPanelId | null {
  if (mode === 'drift') return null;
  const own = ownPanel(mode);
  if (own) return own;
  return current && panelsForMode(mode).includes(current) ? current : 'audio';
}
