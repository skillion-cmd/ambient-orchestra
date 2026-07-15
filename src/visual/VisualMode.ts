/**
 * Field — the layered ink/tube visual (ghosts + bodies).
 * Currents — the wind-map visual: streamline particles advected through an
 * audio-shaped vector field.
 */
export type VisualMode = 'field' | 'currents';

export const DEFAULT_VISUAL_MODE: VisualMode = 'field';

const STORAGE_KEY = 'ao-visual-mode';

export function loadStoredVisualMode(): VisualMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'field' || stored === 'currents') return stored;
  } catch {
    /* private browsing */
  }
  return DEFAULT_VISUAL_MODE;
}

export function storeVisualMode(mode: VisualMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* private browsing */
  }
}
