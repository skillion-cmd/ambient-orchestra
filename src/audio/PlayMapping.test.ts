import { describe, expect, it } from 'vitest';
import {
  degreeForSounded,
  isBlackKey,
  isInScale,
  mapPlayNote,
  midiToNoteName,
  snapOffset,
} from './PlayMapping';
import { MODE_SCALES } from './types';
import type { HarmonicContext } from './types';

function ctx(mode: string, rootMidi = 60): HarmonicContext {
  return { scale: MODE_SCALES[mode]!, rootMidi } as HarmonicContext;
}

/** Pitch classes of a mode, folded into an octave the way the mapper does. */
function members(mode: string): Set<number> {
  return new Set(MODE_SCALES[mode]!.map((s) => ((s % 12) + 12) % 12));
}

describe('PlayMapping', () => {
  it('chromatic tuning passes the note through untouched', () => {
    const c = ctx('lydian', 62);
    for (const note of [36, 48, 60, 61, 72, 96]) {
      expect(mapPlayNote(note, c, 'chromatic')).toBe(note);
    }
  });

  it('chromatic tuning applies the octave shift', () => {
    const c = ctx('lydian');
    expect(mapPlayNote(60, c, 'chromatic', 1)).toBe(72);
    expect(mapPlayNote(60, c, 'chromatic', -2)).toBe(36);
  });

  // The whole point of the drawn piano: a key means the pitch written on it.
  it('sounds a key at its own pitch whenever it is in the field key', () => {
    for (const [name] of Object.entries(MODE_SCALES)) {
      const c = ctx(name, 46);
      const inKey = members(name);
      for (let note = 36; note <= 96; note++) {
        if (!inKey.has(((note - 46) % 12 + 12) % 12)) continue;
        expect(mapPlayNote(note, c, 'scale'), `${name} key ${note}`).toBe(note);
      }
    }
  });

  it('never moves a note more than a semitone in a seven-note mode', () => {
    for (const name of ['lydian', 'major7', 'dreamMinor', 'tropicalBright']) {
      const c = ctx(name, 46);
      for (let note = 36; note <= 96; note++) {
        const moved = Math.abs(mapPlayNote(note, c, 'scale') - note);
        expect(moved, `${name} key ${note}`).toBeLessThanOrEqual(1);
      }
    }
  });

  // The report that started this: in B♭ dreamMinor the old mapping walked
  // scale degrees, so the key drawn as B♭ sounded a G a fifth away.
  it('sounds B flat on the B flat key when B flat is in the field key', () => {
    const c = ctx('dreamMinor', 46); // B♭ dreamMinor
    expect(midiToNoteName(mapPlayNote(70, c, 'scale'))).toBe('A#4');
    expect(midiToNoteName(mapPlayNote(60, c, 'scale'))).toBe('C4');
  });

  it('moves an out-of-key note to the nearest note that is in key', () => {
    const c = ctx('lydian', 60); // C lydian — F# is in, F natural is not.
    expect(mapPlayNote(66, c, 'scale')).toBe(66);
    expect(mapPlayNote(65, c, 'scale')).toBe(64);
  });

  it('every key lands on a member of the current scale', () => {
    for (const [name] of Object.entries(MODE_SCALES)) {
      const c = ctx(name, 45);
      const inKey = members(name);
      for (let note = 36; note <= 96; note++) {
        const sounded = mapPlayNote(note, c, 'scale');
        const interval = ((sounded - 45) % 12 + 12) % 12;
        expect(inKey.has(interval), `${name} key ${note} → ${sounded}`).toBe(true);
      }
    }
  });

  it('stays in the octave you played in', () => {
    // The tuning toggle changes which notes are reachable, not which register
    // your hands are standing in.
    for (const [name] of Object.entries(MODE_SCALES)) {
      const c = ctx(name, 43);
      for (let note = 36; note <= 96; note++) {
        const drift = Math.abs(mapPlayNote(note, c, 'scale') - note);
        expect(drift, `${name} key ${note}`).toBeLessThanOrEqual(6);
      }
    }
  });

  it('applies the octave shift in scale tuning too', () => {
    const c = ctx('lydian', 62);
    for (const note of [60, 64, 67]) {
      expect(mapPlayNote(note, c, 'scale', 1)).toBe(mapPlayNote(note + 12, c, 'scale'));
      expect(mapPlayNote(note, c, 'scale', -1)).toBe(mapPlayNote(note - 12, c, 'scale'));
    }
  });

  it('never runs backwards across the keybed', () => {
    // Snapping folds neighbours together, so two keys can share a pitch — but
    // a key to the right must never sound lower than one to its left.
    for (const [name] of Object.entries(MODE_SCALES)) {
      const c = ctx(name, 62);
      let previous = -1;
      for (let note = 36; note <= 96; note++) {
        const sounded = mapPlayNote(note, c, 'scale');
        expect(sounded, `${name} key ${note}`).toBeGreaterThanOrEqual(previous);
        previous = sounded;
      }
    }
  });

  it('resolves an ambiguous accidental downward', () => {
    // susWash leaves a minor third between its 2 and its 5, so the note in
    // the middle is equidistant. Down is the tie-break, so the black key
    // falls back onto the white key it is drawn beside.
    const c = ctx('susWash', 60);
    expect(snapOffset(63, c)).toBe(-1);
    expect(mapPlayNote(63, c, 'scale')).toBe(62);
  });

  it('clamps extreme octave shifts into MIDI range', () => {
    const c = ctx('lydian', 60);
    expect(mapPlayNote(24, c, 'scale', -6)).toBeGreaterThanOrEqual(0);
    expect(mapPlayNote(108, c, 'scale', 6)).toBeLessThanOrEqual(127);
    expect(mapPlayNote(108, c, 'chromatic', 6)).toBe(127);
  });

  it('survives an empty scale', () => {
    const c = { scale: [], rootMidi: 60 } as unknown as HarmonicContext;
    expect(mapPlayNote(64, c, 'scale')).toBe(64);
    expect(snapOffset(64, c)).toBe(0);
    expect(isInScale(64, c)).toBe(true);
  });

  it('names notes the way Tone reads them', () => {
    expect(midiToNoteName(60)).toBe('C4');
    expect(midiToNoteName(61)).toBe('C#4');
    expect(midiToNoteName(21)).toBe('A0');
  });
});

describe('isInScale', () => {
  it('agrees with the mapper about which keys are left alone', () => {
    // What the keyboard dims and what the mapper moves have to be the same
    // set, or the panel is drawing a different instrument from the one that
    // sounds.
    for (const [name] of Object.entries(MODE_SCALES)) {
      const c = ctx(name, 41);
      for (let note = 36; note <= 96; note++) {
        expect(isInScale(note, c), `${name} key ${note}`).toBe(
          mapPlayNote(note, c, 'scale') === note,
        );
      }
    }
  });

  it('is octave-blind', () => {
    const c = ctx('pentatonic', 60);
    expect(isInScale(60, c)).toBe(true);
    expect(isInScale(72, c)).toBe(true);
    expect(isInScale(61, c)).toBe(false);
  });
});

describe('degreeForSounded', () => {
  it('reads back the degree a scale-tuned key sounded', () => {
    const c = ctx('lydian');
    // Every degree of the mode, played where it actually lies on the keybed.
    MODE_SCALES.lydian!.forEach((semitone, degree) => {
      const key = 60 + semitone;
      expect(mapPlayNote(key, c, 'scale')).toBe(key);
      expect(degreeForSounded(mapPlayNote(key, c, 'scale'), c)).toBe(degree);
    });
  });

  it('is octave-blind — the same pitch class is the same degree', () => {
    const c = ctx('dreamMinor');
    const low = c.rootMidi + c.scale[2]!;
    expect(degreeForSounded(low, c)).toBe(2);
    expect(degreeForSounded(low + 12, c)).toBe(2);
    expect(degreeForSounded(low - 24, c)).toBe(2);
  });

  it('snaps a chromatic passing tone to the degree it passed', () => {
    // Pentatonic leaves a real gap above its third degree, so the semitone
    // above it is unambiguously nearer the degree it came from. Chromatic
    // tuning is where this still happens — scale tuning never sounds one.
    const c = ctx('pentatonic');
    const degree = c.rootMidi + c.scale[2]!;
    expect(degreeForSounded(degree + 1, c)).toBe(2);
  });

  it('survives an empty scale', () => {
    const c = { scale: [], rootMidi: 60 } as unknown as HarmonicContext;
    expect(degreeForSounded(64, c)).toBe(0);
  });
});

describe('isBlackKey', () => {
  it('knows the five black keys of an octave', () => {
    const black = [61, 63, 66, 68, 70].map((n) => isBlackKey(n));
    expect(black.every(Boolean)).toBe(true);
    expect([60, 62, 64, 65, 67, 69, 71].some((n) => isBlackKey(n))).toBe(false);
  });
});
