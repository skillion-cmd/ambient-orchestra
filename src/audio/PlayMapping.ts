import type { HarmonicContext } from './types';

/**
 * How the keybed is laid out.
 *
 * `chromatic` — C is C. A literal keyboard; staying in key is on you.
 * `scale` — the white keys walk the current scale degrees, so the harmonic
 * field's key and mode decide what every key sounds. Nothing you play is out
 * of key, and the layout follows the field as it drifts.
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

/** Middle C — the key that plays the root of the current scale. */
export const REFERENCE_MIDI = 60;

/**
 * Octaves added to the root in scale tuning.
 *
 * `rootMidi` is where the harmonic field puts its *bass* — the beds voice
 * chords at +0 and +1 from it and the melodic voices sit at +1 or +2. Without
 * this lift, middle C would sound a low G somewhere under the pads, and
 * flipping to chromatic would jump the same key up nearly two octaves. Two
 * puts the instrument where the melody voices already live.
 */
const SCALE_BASE_OCTAVE = 2;
const REFERENCE_WHITE_ORDINAL = whiteOrdinal(REFERENCE_MIDI);

/** Count of white keys below `midiNote`, taking C0 as ordinal zero. */
function whiteOrdinal(midiNote: number): number {
  const octave = Math.floor(midiNote / 12);
  const pitchClass = midiNote - octave * 12;
  const index = WHITE_INDEX[pitchClass]!;
  // A black key belongs to the white key below it — its ordinal is that
  // neighbour's, and `isBlackKey` is what lifts it back up a semitone.
  const below = index >= 0 ? index : WHITE_INDEX[pitchClass - 1]!;
  return octave * 7 + below;
}

export function isBlackKey(midiNote: number): boolean {
  const pitchClass = ((midiNote % 12) + 12) % 12;
  return WHITE_INDEX[pitchClass] === -1;
}

/**
 * The MIDI note a played key should actually sound.
 *
 * In scale tuning the degree index runs off either end of the scale array
 * freely — `d = -3` or `d = 19` are ordinary, they just land in a lower or
 * higher octave — so the wrap has to be a floor division rather than a
 * remainder, the same arithmetic `VoiceBase.freqFromDegree` and
 * `noteFromDegree` use to walk degrees past the ends of a scale.
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

  const scale = ctx.scale;
  if (scale.length === 0) return clampMidi(shifted);

  const degree = whiteOrdinal(midiNote) - REFERENCE_WHITE_ORDINAL;
  const index = ((degree % scale.length) + scale.length) % scale.length;
  const octave = Math.floor(degree / scale.length);
  // Black keys are the passing tones between degrees — a semitone above the
  // white key they sit beside, so a chromatic run still reads as a run.
  const accidental = isBlackKey(midiNote) ? 1 : 0;

  return clampMidi(
    ctx.rootMidi +
      scale[index]! +
      (octave + SCALE_BASE_OCTAVE + octaveShift) * 12 +
      accidental,
  );
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
