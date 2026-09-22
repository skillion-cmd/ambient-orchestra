import { PRESENCE_LAYERS, type LayerPresence, type PresenceLayer } from './LayerPresence';
import { PHASE_LABELS } from './Movement';
import type { MovementCharacter, MovementPhase } from './types';

/**
 * A performance: what the orchestra does, written down before it happens.
 *
 * Every other mode here is played live — Drift composes at you, Calibrate
 * lets you steer it, Play puts an instrument in front of it. This is the
 * fourth relationship, and the one an ambient engine is otherwise bad at:
 * deciding the shape of a piece in advance and then hearing it. A performance
 * is an ordered list of cues, each one a stretch of bars with a phase, a set
 * of layers in the room, and the Kit-mode loop either under it or not.
 *
 * What a cue is *not* is a recording. Nothing here schedules a note: a cue
 * tells the Conductor which phase to be in and which layers are audible, and
 * the Conductor keeps composing inside that. Two runs of the same performance
 * are the same shape and never the same piece — which is the point, and the
 * reason this is an arrangement rather than a sequencer.
 *
 * Pure: the model, the arithmetic, and nothing else. `PerformanceRunner`
 * walks it against the transport; `StagePanel` draws it.
 */

/** Which layers stand in the room for a cue. */
export type LayerMask = Record<PresenceLayer, boolean>;

/**
 * How far back a layer a cue leaves out is pushed.
 *
 * Not zero. A layer cut to silence and brought back four bars later announces
 * itself as a mute button being let go — and the engine's own balance walk
 * already rests on the idea that a layer recedes rather than drops out (see
 * `PRESENCE_MIN`, which this is a shade under). Far enough back to read as
 * absent, near enough that its return is the piece opening up rather than
 * something being switched on.
 */
export const CUE_LAYER_FLOOR = 0.06;

export interface StageCue {
  /** Stable across edits and reorders — the panel keys its rows off it. */
  id: string;
  /** What the ensemble is doing while this cue holds. */
  phase: MovementPhase;
  /** How long it holds, in bars of the running transport. */
  bars: number;
  /** Which layers are in the room. */
  layers: LayerMask;
  /** The loop built in Kit mode plays under this cue. */
  kit: boolean;
}

export interface StagePerformance {
  cues: StageCue[];
  /** Run the set again from the top rather than stopping at the end. */
  loop: boolean;
  /**
   * Start the set on a fresh piece of this character, rather than conducting
   * whatever movement happens to be running.
   *
   * Null is "take the piece as it is", which is the faster start: the cues
   * begin on the next bar line. A character asks the field for a new movement
   * first, so the set opens at the top of something rather than in the middle
   * of a bloom it did not ask for — at the cost of the dissolve bridge it
   * takes to get there.
   */
  startFresh: MovementCharacter | null;
}

/** Bar lengths a cue can take — the lengths a section is heard in. */
export const CUE_BAR_OPTIONS = [1, 2, 4, 8, 16] as const;

export const CUE_PHASES: MovementPhase[] = [
  'drift',
  'gather',
  'bloom',
  'hang',
  'dissolve',
  'exhale',
];

/** Short names for the five layer toggles — a cue row is five buttons wide. */
export const LAYER_LABELS: Record<PresenceLayer, string> = {
  pad: 'Pad',
  melody: 'Melody',
  air: 'Air',
  sub: 'Sub',
  pulse: 'Beat',
};

export { PHASE_LABELS };

let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `cue${idCounter}`;
}

export function allLayers(on = true): LayerMask {
  const mask = {} as LayerMask;
  for (const layer of PRESENCE_LAYERS) mask[layer] = on;
  return mask;
}

export function makeCue(patch: Partial<StageCue> = {}): StageCue {
  return {
    id: patch.id ?? nextId(),
    phase: patch.phase ?? 'gather',
    bars: patch.bars ?? 4,
    layers: patch.layers ? { ...patch.layers } : allLayers(),
    kit: patch.kit ?? false,
  };
}

/**
 * The set you are handed the first time.
 *
 * An arc rather than an empty list, for the same reason the kit has starter
 * patterns: "add a cue" against nothing is a blank page, and the thing being
 * asked for here — a shape for a piece — is much easier to edit than to
 * invent. Four cues, one breath: the room opens, the melody arrives over the
 * loop, everything blooms, and it leaves with the pads.
 */
export function defaultPerformance(): StagePerformance {
  return {
    loop: true,
    startFresh: null,
    cues: [
      makeCue({
        phase: 'drift',
        bars: 4,
        layers: { pad: true, melody: false, air: true, sub: true, pulse: false },
      }),
      makeCue({
        phase: 'gather',
        bars: 8,
        layers: { pad: true, melody: true, air: true, sub: true, pulse: false },
        kit: true,
      }),
      makeCue({ phase: 'bloom', bars: 8, layers: allLayers(), kit: true }),
      makeCue({
        phase: 'exhale',
        bars: 4,
        layers: { pad: true, melody: false, air: true, sub: true, pulse: false },
      }),
    ],
  };
}

export function totalBars(performance: StagePerformance): number {
  return performance.cues.reduce((sum, cue) => sum + Math.max(1, cue.bars), 0);
}

/** Roughly how long the set runs at a given tempo, in seconds. */
export function estimateSeconds(performance: StagePerformance, bpm: number): number {
  const beats = totalBars(performance) * 4;
  return beats * (60 / Math.max(1, bpm));
}

export interface CuePosition {
  index: number;
  cue: StageCue;
  /** Bars completed within this cue. */
  barInCue: number;
  /** Bars still to run, including the one in progress. */
  barsLeft: number;
}

/**
 * Which cue a bar of the set falls in.
 *
 * `bar` counts from the set's own first bar, not from the session's. Past the
 * end it returns null rather than clamping: running off the end is a real
 * state — the set is over — and clamping would leave the last cue holding
 * forever, which is exactly the bug a performance mode must not have.
 */
export function cueAtBar(performance: StagePerformance, bar: number): CuePosition | null {
  if (bar < 0) return null;
  let start = 0;
  for (let index = 0; index < performance.cues.length; index++) {
    const cue = performance.cues[index]!;
    const length = Math.max(1, cue.bars);
    if (bar < start + length) {
      return { index, cue, barInCue: bar - start, barsLeft: start + length - bar };
    }
    start += length;
  }
  return null;
}

/** The bar each cue starts on — what the panel draws its timeline from. */
export function cueStarts(performance: StagePerformance): number[] {
  const starts: number[] = [];
  let bar = 0;
  for (const cue of performance.cues) {
    starts.push(bar);
    bar += Math.max(1, cue.bars);
  }
  return starts;
}

/**
 * The bus multipliers a cue asks for.
 *
 * A mask of booleans on the way in, a `LayerPresence` on the way out, because
 * that is the shape the engine's bus gains already compose: base × walk ×
 * duck, and now × this. A cue that leaves a layer in contributes 1 and
 * changes nothing at all, which is what makes "everything on" cost nothing.
 */
export function presenceForCue(cue: StageCue | null): LayerPresence {
  const out = {} as LayerPresence;
  for (const layer of PRESENCE_LAYERS) {
    out[layer] = !cue || cue.layers[layer] ? 1 : CUE_LAYER_FLOOR;
  }
  return out;
}

export function addCue(performance: StagePerformance, cue = makeCue()): StagePerformance {
  return { ...performance, cues: [...performance.cues, cue] };
}

/** Duplicate in place — the fastest way to write a variation of a section. */
export function duplicateCue(performance: StagePerformance, index: number): StagePerformance {
  const cue = performance.cues[index];
  if (!cue) return performance;
  const copy = makeCue({ ...cue, id: nextId() });
  const cues = [...performance.cues];
  cues.splice(index + 1, 0, copy);
  return { ...performance, cues };
}

/** A set with no cues cannot be run, so the last one stays. */
export function removeCue(performance: StagePerformance, index: number): StagePerformance {
  if (performance.cues.length <= 1) return performance;
  const cues = performance.cues.filter((_, i) => i !== index);
  return { ...performance, cues };
}

export function moveCue(
  performance: StagePerformance,
  index: number,
  delta: number,
): StagePerformance {
  const target = index + delta;
  if (index < 0 || index >= performance.cues.length) return performance;
  if (target < 0 || target >= performance.cues.length) return performance;
  const cues = [...performance.cues];
  const [cue] = cues.splice(index, 1);
  cues.splice(target, 0, cue!);
  return { ...performance, cues };
}

export function updateCue(
  performance: StagePerformance,
  index: number,
  /** Layers merge rather than replace, so a row's five toggles are five
   * independent edits instead of one all-or-nothing mask. */
  patch: Partial<Omit<StageCue, 'id' | 'layers'>> & { layers?: Partial<LayerMask> },
): StagePerformance {
  const cue = performance.cues[index];
  if (!cue) return performance;
  const cues = [...performance.cues];
  cues[index] = { ...cue, ...patch, layers: { ...cue.layers, ...(patch.layers ?? {}) } };
  return { ...performance, cues };
}

const PERFORMANCE_KEY = 'ao-stage';

/**
 * Read a stored set back.
 *
 * Same trade as the kit pattern: a cue that comes back malformed is dropped
 * and the rest of the set survives, because the set is work someone did.
 * Only a shape that holds no usable cue at all returns null, and the panel
 * then starts from the default arc.
 */
export function parsePerformance(raw: unknown): StagePerformance | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.cues)) return null;
  const cues: StageCue[] = [];
  for (const entry of value.cues) {
    const cue = parseCue(entry);
    if (cue) cues.push(cue);
  }
  if (cues.length === 0) return null;
  const fresh = value.startFresh;
  return {
    cues,
    loop: value.loop !== false,
    startFresh: fresh === 'open' || fresh === 'night' ? fresh : null,
  };
}

function parseCue(raw: unknown): StageCue | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const phase = value.phase;
  if (typeof phase !== 'string' || !CUE_PHASES.includes(phase as MovementPhase)) return null;
  const bars = value.bars;
  if (typeof bars !== 'number' || !Number.isFinite(bars) || bars < 1 || bars > 64) return null;
  const layers = allLayers();
  const stored = value.layers;
  if (typeof stored === 'object' && stored !== null) {
    for (const layer of PRESENCE_LAYERS) {
      const on = (stored as Record<string, unknown>)[layer];
      if (typeof on === 'boolean') layers[layer] = on;
    }
  }
  return makeCue({
    phase: phase as MovementPhase,
    bars: Math.round(bars),
    layers,
    kit: value.kit === true,
  });
}

export function loadStoredPerformance(): StagePerformance | null {
  try {
    const raw = localStorage.getItem(PERFORMANCE_KEY);
    if (!raw) return null;
    return parsePerformance(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function storePerformance(performance: StagePerformance): void {
  try {
    // The ids are regenerated on load, so they are not worth storing.
    const cues = performance.cues.map(({ phase, bars, layers, kit }) => ({
      phase,
      bars,
      layers,
      kit,
    }));
    localStorage.setItem(
      PERFORMANCE_KEY,
      JSON.stringify({ cues, loop: performance.loop, startFresh: performance.startFresh }),
    );
  } catch {
    /* private browsing */
  }
}
