import type { AppKnobs } from '../audio/types';
import { DEFAULT_KNOBS } from '../audio/types';

/**
 * Drift — purely procedural: rails hidden, the engine self-drives everything.
 * Calibrate — direct control: auto-drift off, knob settings stick and persist.
 */
export type AppMode = 'drift' | 'calibrate';

const MODE_KEY = 'ao-mode';
const KNOBS_KEY = 'ao-knobs';

export function loadStoredMode(): AppMode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === 'drift' || stored === 'calibrate') return stored;
  } catch {
    /* private browsing */
  }
  return 'drift';
}

export function storeMode(mode: AppMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* private browsing */
  }
}

export function loadStoredKnobs(): AppKnobs | null {
  try {
    const raw = localStorage.getItem(KNOBS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const sound = readSection(parsed, 'sound', DEFAULT_KNOBS.sound);
    const visual = readSection(parsed, 'visual', DEFAULT_KNOBS.visual);
    if (!sound || !visual) return null;
    return { sound, visual };
  } catch {
    return null;
  }
}

export function storeKnobs(knobs: AppKnobs): void {
  try {
    localStorage.setItem(KNOBS_KEY, JSON.stringify(knobs));
  } catch {
    /* private browsing */
  }
}

/** Present keys must be finite 0–1 numbers; unknown keys are dropped.
 * Missing keys are backfilled from defaults so calibrations saved before a
 * knob existed still load — only corruption (bad type/range) resets. */
function readSection<T extends object>(
  parsed: unknown,
  section: string,
  defaults: T,
): T | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const raw = (parsed as Record<string, unknown>)[section];
  if (typeof raw !== 'object' || raw === null) return null;
  const out: Record<string, number> = {};
  for (const key of Object.keys(defaults)) {
    const value = (raw as Record<string, unknown>)[key];
    if (value === undefined) {
      out[key] = (defaults as Record<string, number>)[key]!;
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      return null;
    }
    out[key] = value;
  }
  return out as unknown as T;
}
