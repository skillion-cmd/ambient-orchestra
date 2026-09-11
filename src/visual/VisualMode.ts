/**
 * Field — the layered ink/tube visual (ghosts + bodies).
 * Currents — the wind-map visual: streamline particles advected through an
 * audio-shaped vector field.
 * Resonance — a Chladni plate: grains settling onto the nodal lines of a
 * standing wave whose mode numbers come from the chord being held.
 */
export type VisualMode = 'field' | 'currents' | 'resonance';

export const VISUAL_MODES: VisualMode[] = ['field', 'currents', 'resonance'];

/** What the toggle calls each one. */
export const VISUAL_MODE_LABELS: Record<VisualMode, string> = {
  field: 'Ink',
  currents: 'Currents',
  resonance: 'Resonance',
};

export const DEFAULT_VISUAL_MODE: VisualMode = 'field';

const STORAGE_KEY = 'ao-visual-mode';

export function isVisualMode(value: unknown): value is VisualMode {
  return VISUAL_MODES.includes(value as VisualMode);
}

export function loadStoredVisualMode(): VisualMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isVisualMode(stored)) return stored;
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
