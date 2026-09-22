import { KIT_LABELS, KIT_LAYOUT, type KitPieceId } from './PlayKit';

/**
 * The loop you build in Kit mode.
 *
 * A pattern is a grid: one row per kit piece, one column per sixteenth, and
 * two to eight bars of them. Everything here is pure — no audio, no DOM, no
 * transport — because the two things that go wrong with a step sequencer are
 * both arithmetic: the grid disagreeing with the bar line, and a resize
 * losing the groove you had. Both are testable, and neither needs a speaker.
 *
 * `KitSequencer` plays one of these against the transport; `KitPanel` draws
 * one. Nothing else knows the shape.
 */

/** Sixteenths to the bar. A step is a 16th note, as on every drum machine. */
export const STEPS_PER_BAR = 16;

/**
 * Loop lengths, in bars.
 *
 * Two, four and eight rather than a free number: these are the lengths a
 * loop is *heard* in — two bars is a groove, four is a phrase, eight is a
 * section — and a pattern whose length is a power of two always lines up
 * with the ensemble's own bar lines however long the piece has been running.
 */
export type KitLoopBars = 2 | 4 | 8;

export const LOOP_BAR_OPTIONS: KitLoopBars[] = [2, 4, 8];

export function isLoopBars(value: unknown): value is KitLoopBars {
  return value === 2 || value === 4 || value === 8;
}

/**
 * What a cell holds.
 *
 * Three states, not two. A drum loop with one velocity is a drum machine
 * demo: the hats that make a groove breathe are the quiet ones between the
 * loud ones, and a grid that can only say "hit" cannot write that down. Click
 * cycles silent → hit → accent, which is the same gesture a two-state grid
 * has plus one more press.
 */
export type StepLevel = 0 | 1 | 2;

/** Velocity each level plays at, before the kit's own per-piece trim. */
export const STEP_VELOCITY: Record<Exclude<StepLevel, 0>, number> = {
  1: 0.55,
  2: 0.95,
};

export interface KitPattern {
  bars: KitLoopBars;
  /** Piece → one level per step, always `bars * STEPS_PER_BAR` long. */
  rows: Record<KitPieceId, StepLevel[]>;
}

/**
 * Row order for the grid, loudest-and-highest at the top.
 *
 * Not `KIT_LAYOUT`, which is the *keyboard* layout — ordered by semitone so a
 * hand can find the pieces without looking. A grid is read rather than
 * played, and it is read the way a drum machine prints one: cymbals and hats
 * along the top, the backbeat through the middle, the kick on the floor. The
 * two orders serve two different jobs on the same twelve pieces.
 */
export const KIT_ROWS: KitPieceId[] = [
  'ride',
  'hatOpen',
  'hatClosed',
  'shaker',
  'crackle',
  'clap',
  'snare',
  'rim',
  'tomMid',
  'tomLow',
  'sub',
  'kick',
];

export function stepCount(bars: KitLoopBars): number {
  return bars * STEPS_PER_BAR;
}

export function patternSteps(pattern: KitPattern): number {
  return stepCount(pattern.bars);
}

export function emptyPattern(bars: KitLoopBars = 2): KitPattern {
  const rows = {} as Record<KitPieceId, StepLevel[]>;
  for (const piece of KIT_LAYOUT) rows[piece] = new Array(stepCount(bars)).fill(0);
  return { bars, rows };
}

export function isEmpty(pattern: KitPattern): boolean {
  return KIT_LAYOUT.every((piece) => pattern.rows[piece].every((level) => level === 0));
}

/** How many cells are struck — what the panel counts to say "12 hits". */
export function hitCount(pattern: KitPattern): number {
  let total = 0;
  for (const piece of KIT_LAYOUT) {
    for (const level of pattern.rows[piece]) if (level > 0) total++;
  }
  return total;
}

/** A copy with one cell set. Patterns are replaced, never mutated in place —
 * the panel and the sequencer both hold one, and a shared mutable grid is how
 * a redraw ends up a step behind what is sounding. */
export function setStep(
  pattern: KitPattern,
  piece: KitPieceId,
  step: number,
  level: StepLevel,
): KitPattern {
  const steps = patternSteps(pattern);
  if (step < 0 || step >= steps) return pattern;
  const rows = { ...pattern.rows };
  const row = [...rows[piece]];
  row[step] = level;
  rows[piece] = row;
  return { bars: pattern.bars, rows };
}

/** Silent → hit → accent → silent. The grid's one gesture. */
export function cycleStep(pattern: KitPattern, piece: KitPieceId, step: number): KitPattern {
  const current = pattern.rows[piece][step] ?? 0;
  const next = ((current + 1) % 3) as StepLevel;
  return setStep(pattern, piece, step, next);
}

/** Wipe one piece's row — the fastest way out of a hat part that got away. */
export function clearRow(pattern: KitPattern, piece: KitPieceId): KitPattern {
  const rows = { ...pattern.rows };
  rows[piece] = new Array(patternSteps(pattern)).fill(0);
  return { bars: pattern.bars, rows };
}

/**
 * Change the loop's length, keeping what is already written.
 *
 * Growing *tiles* rather than pads with silence: going from two bars to four
 * is almost always "I want room to vary the second half", and the answer to
 * that is the same groove twice with the back half now editable — not the
 * groove followed by two bars of nothing, which is a different loop and never
 * the one anyone meant. Shrinking truncates, which is the only honest
 * reading: the bars being dropped have nowhere to go.
 */
export function resizePattern(pattern: KitPattern, bars: KitLoopBars): KitPattern {
  if (bars === pattern.bars) return pattern;
  const from = patternSteps(pattern);
  const to = stepCount(bars);
  const rows = {} as Record<KitPieceId, StepLevel[]>;
  for (const piece of KIT_LAYOUT) {
    const source = pattern.rows[piece];
    const row: StepLevel[] = new Array(to);
    for (let i = 0; i < to; i++) row[i] = source[i % from] ?? 0;
    rows[piece] = row;
  }
  return { bars, rows };
}

/**
 * Starter loops.
 *
 * An empty grid is the worst thing to hand someone who has never built a
 * beat: twelve rows of nothing, and no clue which of the 192 cells is the one
 * that makes a sound they recognise. Each of these is one bar, tiled to
 * whatever length the loop is, and each one is a groove you can hear the
 * shape of after four cells — a starting point to take apart rather than a
 * pattern to keep.
 *
 * Written as digit strings because that is what they look like: sixteen
 * characters, one per step, and the bar lines up under itself on the page.
 */
export interface KitPatternPreset {
  id: string;
  label: string;
  hint: string;
  /** One bar per piece; anything unlisted stays silent. */
  bar: Partial<Record<KitPieceId, string>>;
}

export const KIT_PATTERN_PRESETS: KitPatternPreset[] = [
  {
    id: 'four',
    label: 'Four',
    hint: 'four on the floor, backbeat, straight eighths on the hat',
    bar: {
      kick: '2000200020002000',
      snare: '0000200000002000',
      hatClosed: '1010101010101010',
    },
  },
  {
    id: 'broken',
    label: 'Broken',
    hint: 'a broken kick under sixteenth hats — the one to take apart',
    bar: {
      kick: '2000001000200000',
      snare: '0000200000002000',
      hatClosed: '1112111211121112',
      shaker: '0010001000100010',
    },
  },
  {
    id: 'twostep',
    label: '2-step',
    hint: 'the night piece’s own shuffle: kick, gap, snare off the grid',
    bar: {
      kick: '2000000000100000',
      snare: '0000200000200000',
      rim: '0000000010000000',
      hatClosed: '1010111010101110',
      crackle: '0000000000001000',
    },
  },
  {
    id: 'pulse',
    label: 'Pulse',
    hint: 'sub and ride only — felt rather than heard',
    bar: {
      sub: '2000000020000000',
      ride: '0010001000100010',
    },
  },
];

/** Build a full-length pattern from a preset, tiled to `bars`. */
export function patternFromPreset(preset: KitPatternPreset, bars: KitLoopBars): KitPattern {
  const pattern = emptyPattern(bars);
  const steps = stepCount(bars);
  for (const piece of KIT_LAYOUT) {
    const bar = preset.bar[piece];
    if (!bar) continue;
    const row = pattern.rows[piece];
    for (let i = 0; i < steps; i++) {
      row[i] = levelFromChar(bar[i % STEPS_PER_BAR]);
    }
  }
  return pattern;
}

function levelFromChar(char: string | undefined): StepLevel {
  return char === '1' ? 1 : char === '2' ? 2 : 0;
}

/** Piece labels, re-exported so the panel has one import for the grid. */
export { KIT_LABELS };

const PATTERN_KEY = 'ao-kit';

/** The stored shape: rows as digit strings, which is both compact and
 * readable in devtools when a loop comes back wrong. */
interface StoredPattern {
  bars: number;
  rows: Record<string, string>;
}

export function serializePattern(pattern: KitPattern): StoredPattern {
  const rows: Record<string, string> = {};
  for (const piece of KIT_LAYOUT) {
    const row = pattern.rows[piece];
    // A silent row is the default and by far the common case — twelve of them
    // is most of a stored empty pattern, and none of it says anything.
    if (row.some((level) => level > 0)) rows[piece] = row.join('');
  }
  return { bars: pattern.bars, rows };
}

/**
 * Read a stored pattern back.
 *
 * Forgiving in exactly one direction: an unknown piece or a row of the wrong
 * length is dropped, a missing row is silence, and only a shape that is not a
 * pattern at all returns null. A loop is work someone did, and throwing all
 * of it away because one row came back short would be the wrong trade every
 * time.
 */
export function parsePattern(raw: unknown): KitPattern | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (!isLoopBars(value.bars)) return null;
  const pattern = emptyPattern(value.bars);
  const steps = stepCount(value.bars);
  const rows = value.rows;
  if (typeof rows !== 'object' || rows === null) return pattern;
  for (const piece of KIT_LAYOUT) {
    const row = (rows as Record<string, unknown>)[piece];
    if (typeof row !== 'string' || row.length !== steps) continue;
    for (let i = 0; i < steps; i++) pattern.rows[piece][i] = levelFromChar(row[i]);
  }
  return pattern;
}

export function loadStoredPattern(): KitPattern | null {
  try {
    const raw = localStorage.getItem(PATTERN_KEY);
    if (!raw) return null;
    return parsePattern(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function storePattern(pattern: KitPattern): void {
  try {
    localStorage.setItem(PATTERN_KEY, JSON.stringify(serializePattern(pattern)));
  } catch {
    /* private browsing */
  }
}
