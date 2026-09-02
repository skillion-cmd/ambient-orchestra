import type { LayerPresence } from './LayerPresence';

/**
 * How far forward the instrument sits, and what the orchestra does about it.
 *
 * Play mode's first version answered that question once, in the loudest
 * possible way: the instrument entered the chain at unity while every
 * generative bus sat at roughly half after its own trims, and the whole
 * ensemble dropped ~10dB the instant a key went down. The result read as a
 * synth switched on over a backing track that had been told to get out of
 * the way — loud, and not in the piece.
 *
 * This module is the model that replaces it. Three things do the work:
 *
 * - **Gain staging.** The instrument's bus level is a real level, calibrated
 *   against where the layer buses actually sit, not unity.
 * - **A register-aware duck.** The orchestra makes room where the instrument
 *   is, not everywhere. Melody and air share the instrument's range and step
 *   well back; the pads carrying the harmony you are playing over stay; the
 *   sub and the beat barely move, because nothing you play is down there.
 * - **Proportion.** How far it steps back tracks how much you are playing.
 *   One held note is not a chord, and neither should sound like one.
 */
export type PlayBlendId = 'behind' | 'with' | 'front';

export interface PlayBlend {
  id: PlayBlendId;
  /** Panel label — the row is three buttons wide. */
  label: string;
  /** The button's tooltip: what this does to the balance, in one line. */
  hint: string;
  /** Bus trim for the instrument, in the same units as the layer buses. */
  level: number;
  /**
   * How much of the Conductor's session arc the instrument rides, 0–1.
   *
   * The arc is the piece breathing over minutes. At 0 the instrument ignores
   * it and stays put while the orchestra swells and recedes around it, which
   * is what made it feel bolted on; at 1 it would disappear in the troughs.
   * In between it breathes with the piece and still holds the front.
   */
  arcFollow: number;
  /** Where each layer sits when you are playing your hardest. */
  floor: LayerPresence;
}

export const PLAY_BLENDS: PlayBlend[] = [
  {
    id: 'behind',
    label: 'Behind',
    hint: 'play inside the ensemble — it barely moves for you',
    level: 0.34,
    arcFollow: 0.62,
    floor: { melody: 0.72, air: 0.7, pad: 0.92, sub: 1, pulse: 0.96 },
  },
  {
    id: 'with',
    label: 'With',
    hint: 'play with the ensemble — it makes room in your register',
    level: 0.52,
    arcFollow: 0.45,
    floor: { melody: 0.44, air: 0.42, pad: 0.74, sub: 0.94, pulse: 0.88 },
  },
  {
    id: 'front',
    label: 'Front',
    hint: 'play over the ensemble — it drops well back behind you',
    level: 0.75,
    arcFollow: 0.22,
    floor: { melody: 0.22, air: 0.2, pad: 0.5, sub: 0.82, pulse: 0.7 },
  },
];

export const DEFAULT_BLEND_ID: PlayBlendId = 'with';

export function findBlend(id: string): PlayBlend {
  return PLAY_BLENDS.find((b) => b.id === id) ?? PLAY_BLENDS[1]!;
}

export function isBlendId(value: unknown): value is PlayBlendId {
  return value === 'behind' || value === 'with' || value === 'front';
}

/**
 * Output trim for `voices` notes sounding at once.
 *
 * A PolySynth sums its voices, so a six-note chord arrives roughly six times
 * hotter than the single note that felt right when the preset was voiced —
 * which is most of what "loud" was. Full compensation (1/n) is wrong too: a
 * chord that measures exactly as loud as one note reads as the instrument
 * getting quieter as you add fingers. Partly-uncorrelated partials sum nearer
 * the square root, and `n^-0.35` sits just under that, so a chord still grows
 * — six notes are about 2.6x one note rather than six — without ever reaching
 * for the limiter.
 */
export function chordTrim(voices: number): number {
  if (voices <= 1) return 1;
  return Math.pow(voices, -0.35);
}

/**
 * Velocity to output amplitude.
 *
 * The original curve was `0.25 + v * 0.75`: a floor a quarter of the way up
 * with a straight line above it, which is to say almost no dynamics at all —
 * the softest possible touch came out two thirds as loud as the hardest. That
 * is fine as insurance against a pad you cannot hear and useless as
 * expression. The floor drops to something you can still just hear, and the
 * curve above it is convex, so the middle of the keybed — where a computer
 * keyboard's fixed 0.7 and most playing actually live — sits well below full.
 */
export function velocityCurve(velocity: number): number {
  const v = Math.max(0, Math.min(1, velocity));
  return 0.09 + Math.pow(v, 1.7) * 0.91;
}

/**
 * The per-layer multipliers the ensemble buses should carry right now.
 *
 * `energy` is 0 when you are not playing and 1 when you are leaning on it.
 * Each layer travels from 1 to its floor in proportion, so the orchestra
 * leans away from you by as much as you are leaning in.
 */
export function duckFor(blend: PlayBlend, energy: number): LayerPresence {
  const e = Math.max(0, Math.min(1, energy));
  const layers = Object.keys(blend.floor) as (keyof LayerPresence)[];
  const out = {} as LayerPresence;
  for (const layer of layers) out[layer] = 1 - (1 - blend.floor[layer]) * e;
  return out;
}

/** Every layer at 1 — nothing playing, or play mode not active. */
export const NO_DUCK: LayerPresence = { melody: 1, air: 1, pad: 1, sub: 1, pulse: 1 };

/**
 * How loud the instrument's bus should be, given the blend and where the
 * Conductor's session arc currently sits.
 */
export function instrumentLevel(blend: PlayBlend, masterIntensity: number): number {
  const arc = Math.max(0, Math.min(1, masterIntensity));
  return blend.level * (1 - blend.arcFollow + blend.arcFollow * arc);
}

/**
 * Play energy — how much of the instrument is currently in use.
 *
 * Rises within a note's attack so the orchestra is already moving by the time
 * the chord blooms, and falls over a couple of seconds so the gaps between
 * phrases don't make the bed surge in and out. Held notes hold it up: this is
 * what you are doing, not what you just did.
 */
export function advanceEnergy(current: number, heldVoices: number, dt: number): number {
  const target = heldVoices > 0 ? Math.min(1, 0.42 + heldVoices * 0.17) : 0;
  const tau = target > current ? 0.12 : 1.9;
  const k = 1 - Math.exp(-Math.max(0, dt) / tau);
  const next = current + (target - current) * k;
  return next < 1e-4 && target === 0 ? 0 : next;
}
