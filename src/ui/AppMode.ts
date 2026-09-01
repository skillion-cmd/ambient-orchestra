import type { AppKnobs } from '../audio/types';
import { DEFAULT_KNOBS } from '../audio/types';

/**
 * Drift — purely procedural: rails hidden, the engine self-drives everything.
 * Calibrate — direct control: auto-drift off, knob settings stick and persist.
 * Play — Calibrate plus an instrument: a MIDI or computer keyboard plays a
 * polyphonic voice at the front of the mix while the orchestra ducks behind it.
 */
export type AppMode = 'drift' | 'calibrate' | 'play';

/** Modes where the knobs hold still and a calibration is worth remembering. */
export function isDirectMode(mode: AppMode): boolean {
  return mode === 'calibrate' || mode === 'play';
}

const MODE_KEY = 'ao-mode';
const KNOBS_KEY = 'ao-knobs';
const PLAY_KEY = 'ao-play';

/** What the instrument was set to last time — restored on the next session. */
export interface StoredPlayState {
  presetId: string;
  tuning: 'scale' | 'chromatic';
  octaveShift: number;
}

export function loadStoredPlayState(): StoredPlayState | null {
  try {
    const raw = localStorage.getItem(PLAY_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = parsed as Record<string, unknown>;
    const tuning = value.tuning;
    const octaveShift = value.octaveShift;
    if (typeof value.presetId !== 'string') return null;
    if (tuning !== 'scale' && tuning !== 'chromatic') return null;
    if (typeof octaveShift !== 'number' || !Number.isInteger(octaveShift)) return null;
    if (octaveShift < -3 || octaveShift > 3) return null;
    return { presetId: value.presetId, tuning, octaveShift };
  } catch {
    return null;
  }
}

export function storePlayState(state: StoredPlayState): void {
  try {
    localStorage.setItem(PLAY_KEY, JSON.stringify(state));
  } catch {
    /* private browsing */
  }
}

export function loadStoredMode(): AppMode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === 'drift' || stored === 'calibrate' || stored === 'play') return stored;
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
