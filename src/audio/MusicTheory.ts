import type { ChordFunction, MelodyPhraseType, MovementPhase } from './types';
import { CHORD_POOLS } from './types';

const CHORD_BY_FUNCTION: Record<ChordFunction, number[][]> = {
  tonic: [[0, 2, 4], [0, 2, 4, 6], [0, 1, 4]],
  subdominant: [[0, 1, 3], [0, 1, 3, 5], [0, 2, 3, 5]],
  dominant: [[0, 2, 3, 5], [0, 1, 3], [0, 2, 4, 6]],
  color: [[0, 1, 4], [0, 2, 3, 5], [0, 1, 3, 5]],
};

const TRANSITIONS: Record<ChordFunction, { fn: ChordFunction; w: number }[]> = {
  tonic: [
    { fn: 'subdominant', w: 1.2 },
    { fn: 'dominant', w: 0.9 },
    { fn: 'color', w: 0.6 },
    { fn: 'tonic', w: 0.4 },
  ],
  subdominant: [
    { fn: 'dominant', w: 1.1 },
    { fn: 'tonic', w: 1.0 },
    { fn: 'color', w: 0.5 },
  ],
  dominant: [
    { fn: 'tonic', w: 1.5 },
    { fn: 'subdominant', w: 0.4 },
    { fn: 'color', w: 0.3 },
  ],
  color: [
    { fn: 'tonic', w: 1.0 },
    { fn: 'subdominant', w: 0.8 },
    { fn: 'dominant', w: 0.6 },
  ],
};

function weightedPickFn(items: { fn: ChordFunction; w: number }[]): ChordFunction {
  const total = items.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.w;
    if (r <= 0) return item.fn;
  }
  return items[items.length - 1]!.fn;
}

function pickVoicing(fn: ChordFunction): number[] {
  const pool = CHORD_BY_FUNCTION[fn];
  return [...pool[Math.floor(Math.random() * pool.length)]!];
}

export function pickInitialChord(phase: MovementPhase): {
  degrees: number[];
  fn: ChordFunction;
  brightness: number;
} {
  const fn: ChordFunction =
    phase === 'bloom' || phase === 'hang'
      ? 'tonic'
      : phase === 'gather'
        ? 'subdominant'
        : 'color';
  return {
    degrees: pickVoicing(fn),
    fn,
    brightness: brightnessForFunction(fn),
  };
}

export function pickNextChord(
  currentFn: ChordFunction,
  phase: MovementPhase,
  entropy: number,
): { degrees: number[]; fn: ChordFunction; brightness: number } {
  let transitions = [...TRANSITIONS[currentFn]];

  if (phase === 'bloom' || phase === 'hang') {
    transitions = transitions.map((t) =>
      t.fn === 'tonic' ? { ...t, w: t.w * 1.4 } : t,
    );
  } else if (phase === 'gather') {
    transitions = transitions.map((t) =>
      t.fn === 'dominant' || t.fn === 'subdominant'
        ? { ...t, w: t.w * 1.2 }
        : t,
    );
  } else if (phase === 'dissolve' || phase === 'exhale') {
    transitions = transitions.map((t) =>
      t.fn === 'color' ? { ...t, w: t.w * (1 + entropy) } : t,
    );
  }

  if (Math.random() < entropy * 0.15) {
    const randomPool = CHORD_POOLS[Math.floor(Math.random() * CHORD_POOLS.length)]!;
    return {
      degrees: [...randomPool],
      fn: 'color',
      brightness: 0.55 + entropy * 0.2,
    };
  }

  const nextFn = weightedPickFn(transitions);
  return {
    degrees: pickVoicing(nextFn),
    fn: nextFn,
    brightness: brightnessForFunction(nextFn),
  };
}

function brightnessForFunction(fn: ChordFunction): number {
  switch (fn) {
    case 'tonic':
      return 0.85;
    case 'subdominant':
      return 0.65;
    case 'dominant':
      return 0.7;
    case 'color':
      return 0.55;
  }
}

export function melodyDurationBeats(
  phraseType: MelodyPhraseType,
  phase: MovementPhase,
): number {
  switch (phraseType) {
    case 'hook':
    case 'answer':
      return phase === 'bloom' ? 1.5 : 2;
    case 'ladder':
      return 1;
    case 'recall':
      return 2.5;
    case 'drift':
    default:
      return phase === 'drift' ? 3 : 2;
  }
}

export function pickPhraseType(phase: MovementPhase): MelodyPhraseType {
  switch (phase) {
    case 'bloom':
    case 'hang':
      return Math.random() < 0.7 ? 'hook' : 'answer';
    case 'gather':
      return Math.random() < 0.5 ? 'ladder' : 'hook';
    case 'dissolve':
      return Math.random() < 0.4 ? 'recall' : 'drift';
    case 'exhale':
      return 'drift';
    case 'drift':
    default:
      return Math.random() < 0.6 ? 'drift' : 'ladder';
  }
}

export function generatePhrase(
  scaleLen: number,
  phraseType: MelodyPhraseType,
  previousHook: number[] | null,
): number[] {
  switch (phraseType) {
    case 'hook':
      return generateHook(scaleLen);
    case 'answer':
      return generateAnswer(scaleLen);
    case 'ladder':
      return generateLadder(scaleLen);
    case 'recall':
      return recallPhrase(previousHook, scaleLen);
    case 'drift':
    default:
      return generateDrift(scaleLen);
  }
}

function generateHook(scaleLen: number): number[] {
  const start = Math.min(scaleLen - 1, 2 + Math.floor(Math.random() * 2));
  const phrase: number[] = [start];
  const steps = [1, 1, -1, 0];
  let pos = start;
  for (let i = 1; i < 4; i++) {
    pos = Math.max(0, Math.min(scaleLen - 1, pos + (steps[i - 1] ?? 1)));
    phrase.push(pos);
  }
  const settle = Math.min(scaleLen - 1, Math.max(2, Math.floor(scaleLen * 0.35)));
  phrase[3] = settle;
  return [...phrase, ...phrase];
}

function generateAnswer(scaleLen: number): number[] {
  const start = Math.min(scaleLen - 1, 3 + Math.floor(Math.random() * 2));
  const phrase: number[] = [start];
  let pos = start;
  for (let i = 1; i < 4; i++) {
    pos = Math.max(0, pos - (Math.random() < 0.6 ? 1 : 2));
    phrase.push(pos);
  }
  phrase[3] = 0;
  return phrase;
}

function generateLadder(scaleLen: number): number[] {
  const fib = [1, 1, 2, 3];
  let pos = 1 + Math.floor(Math.random() * 2);
  const phrase = [pos];
  for (const step of fib) {
    pos = Math.min(scaleLen - 1, pos + step);
    phrase.push(pos);
  }
  return phrase;
}

function generateDrift(scaleLen: number): number[] {
  const len = 5 + Math.floor(Math.random() * 3);
  const phrase: number[] = [];
  let pos = Math.floor(Math.random() * scaleLen);
  const upper = Math.max(2, scaleLen - 2);
  for (let i = 0; i < len; i++) {
    phrase.push(pos);
    const step =
      pos >= upper
        ? -Math.floor(Math.random() * 2) - 1
        : Math.random() < 0.55
          ? 1
          : Math.random() < 0.75
            ? 0
            : -1;
    pos = Math.max(0, Math.min(scaleLen - 1, pos + step));
  }
  return phrase;
}

function recallPhrase(previous: number[] | null, scaleLen: number): number[] {
  if (!previous || previous.length === 0) return generateHook(scaleLen);
  const transpose = Math.random() < 0.5 ? 1 : 2;
  return previous.map((d) => Math.min(scaleLen - 1, d + transpose));
}

/** @deprecated use generatePhrase */
export function pickMelodyPhrase(scaleLen: number): number[] {
  return generateDrift(scaleLen);
}
