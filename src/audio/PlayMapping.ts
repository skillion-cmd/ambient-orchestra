import type { HarmonicContext } from './types';

/**
 * How the keybed is laid out.
 *
 * `chromatic` — C is C. A literal keyboard; staying in key is on you.
 * `scale` — every key still sounds its own pitch, except the handful that
 * are outside the field's current key: those snap to the nearest note that
 * is inside it. Nothing you play is out of key, and the drawn piano still
 * means what it says.
 *
 * The older reading of `scale` walked the white keys through the scale
 * degrees, so the whole keybed slid as the field drifted — middle C sounded
 * whatever the root was, and the key drawn as B♭ could sound a G. That is
 * fine on a grid of identical pads; under a picture of a piano it is a
 * keyboard that lies about its own keys, which is exactly what a player
 * reads first and trusts hardest.
 */
export type PlayTuning = 'scale' | 'chromatic';

/** Semitone offsets of the white keys within an octave. */
const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

/** Index into WHITE_SEMITONES for a white pitch class; -1 for a black one. */
const WHITE_INDEX = WHITE_SEMITONES.reduce<number[]>(
  (acc, semitone, index) => {
    acc[semitone] = index;
    return acc;
  },
  new Array<number>(12).fill(-1),
);

/** The furthest a snap can ever travel — half an octave, either way. */
const MAX_SNAP = 6;

export function isBlackKey(midiNote: number): boolean {
  return WHITE_INDEX[mod12(midiNote)] === -1;
}

/**
 * The MIDI note a played key should actually sound.
 *
 * Chromatic passes the key straight through. Scale tuning leaves it alone
 * too whenever the key is already in the field's key, and otherwise moves it
 * to the nearest pitch that is — at most a semitone in any real mode, and
 * never more than `MAX_SNAP`. Either way the octave you played in is the
 * octave you hear, so the tuning toggle changes which notes are reachable,
 * not where on the instrument you are standing.
 *
 * Called at note-on only. A held note keeps the pitch it was struck at even
 * as the harmonic field drifts to a new key underneath it — retuning a note
 * mid-hold would be a glissando nobody asked for.
 */
export function mapPlayNote(
  midiNote: number,
  ctx: HarmonicContext,
  tuning: PlayTuning,
  octaveShift = 0,
): number {
  const shifted = midiNote + octaveShift * 12;
  if (tuning === 'chromatic') return clampMidi(shifted);
  return clampMidi(shifted + snapOffset(shifted, ctx));
}

/** True when `midiNote` is already a member of the field's current key. */
export function isInScale(midiNote: number, ctx: HarmonicContext): boolean {
  const members = scalePitchClasses(ctx.scale);
  if (members.size === 0) return true;
  return members.has(mod12(midiNote - ctx.rootMidi));
}

/**
 * Semitones from `midiNote` to the nearest note of the field's key.
 *
 * Searched outward from zero so an in-key note costs nothing, and downward
 * before upward at each distance. That tie-break is what makes the common
 * case read the way a player expects: in an ordinary seven-note mode every
 * accidental sits a semitone above a scale tone and a semitone below the
 * next, and resolving down means the black keys fall back onto the white
 * key they are drawn beside rather than jumping over it.
 */
export function snapOffset(midiNote: number, ctx: HarmonicContext): number {
  const members = scalePitchClasses(ctx.scale);
  if (members.size === 0) return 0;
  const relative = mod12(midiNote - ctx.rootMidi);
  for (let step = 0; step <= MAX_SNAP; step++) {
    if (members.has(mod12(relative - step))) return -step;
    if (members.has(mod12(relative + step))) return step;
  }
  return 0;
}

/**
 * The scale as a set of pitch classes.
 *
 * Modes here are written as running offsets rather than reduced ones —
 * `minorAdd9` ends on 14 and `susWash` on 12 — so they have to be folded
 * into an octave before they can be asked about membership.
 */
function scalePitchClasses(scale: number[]): Set<number> {
  const members = new Set<number>();
  for (const semitone of scale) members.add(mod12(semitone));
  return members;
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}

function clampMidi(note: number): number {
  return Math.max(0, Math.min(127, Math.round(note)));
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Scientific pitch name for a MIDI note — readouts and Tone both take these. */
export function midiToNoteName(midiNote: number): string {
  const clamped = clampMidi(midiNote);
  const pitchClass = clamped % 12;
  const octave = Math.floor(clamped / 12) - 1;
  return `${NOTE_NAMES[pitchClass]!}${octave}`;
}

/**
 * Which scale degree a sounded note lands on.
 *
 * The inverse of what `mapPlayNote` just did, and it has to be computed from
 * the *sounded* pitch rather than the key pressed, because chromatic tuning
 * has no degree at all until you ask what the note is nearest to. In scale
 * tuning the sounded pitch is always a scale member, so this is exact there;
 * in chromatic it snaps an accidental to the degree it passed, which is the
 * right answer for a listening ensemble — you played through it, not at it.
 */
export function degreeForSounded(soundedMidi: number, ctx: HarmonicContext): number {
  const scale = ctx.scale;
  if (scale.length === 0) return 0;
  const pitchClass = mod12(soundedMidi - ctx.rootMidi);
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < scale.length; i++) {
    const degreeClass = mod12(scale[i]!);
    const raw = Math.abs(degreeClass - pitchClass);
    const distance = Math.min(raw, 12 - raw);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}
