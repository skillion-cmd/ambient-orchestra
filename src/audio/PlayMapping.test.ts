import { describe, expect, it } from 'vitest';
import { isBlackKey, mapPlayNote, midiToNoteName, REFERENCE_MIDI } from './PlayMapping';
import { MODE_SCALES } from './types';
import type { HarmonicContext } from './types';

function ctx(mode: string, rootMidi = 60): HarmonicContext {
  return { scale: MODE_SCALES[mode]!, rootMidi } as HarmonicContext;
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

  it('middle C sounds the root of the current field, in playing register', () => {
    // rootMidi is the field's bass; the instrument voices two octaves up,
    // where the melodic voices sit.
    expect(mapPlayNote(REFERENCE_MIDI, ctx('lydian', 65), 'scale')).toBe(65 + 24);
    expect(mapPlayNote(REFERENCE_MIDI, ctx('dreamMinor', 51), 'scale')).toBe(51 + 24);
  });

  it('keeps the two tunings within an octave of each other on the same key', () => {
    // Flipping the toggle should change what note you get, not what register
    // you are playing in.
    const c = ctx('lydian', 48);
    for (const key of [60, 64, 67, 72]) {
      const scaled = mapPlayNote(key, c, 'scale');
      const chromatic = mapPlayNote(key, c, 'chromatic');
      expect(Math.abs(scaled - chromatic)).toBeLessThanOrEqual(12);
    }
  });

  it('white keys walk the scale degrees in order', () => {
    const c = ctx('lydian', 60);
    // C D E F G A B — seven white keys, seven degrees of lydian.
    const whites = [60, 62, 64, 65, 67, 69, 71];
    expect(whites.map((n) => mapPlayNote(n, c, 'scale'))).toEqual(
      MODE_SCALES.lydian!.map((s) => 84 + s),
    );
  });

  it('wraps into the next octave past the end of a five-note scale', () => {
    const c = ctx('pentatonic', 60);
    const scale = MODE_SCALES.pentatonic!;
    // The sixth white key is degree 5 — the root an octave up.
    expect(mapPlayNote(69, c, 'scale')).toBe(84 + scale[0]! + 12);
    expect(mapPlayNote(71, c, 'scale')).toBe(84 + scale[1]! + 12);
  });

  it('wraps downward below the reference key', () => {
    const c = ctx('pentatonic', 60);
    const scale = MODE_SCALES.pentatonic!;
    // B below middle C is degree -1 — the top of the scale, an octave down.
    expect(mapPlayNote(59, c, 'scale')).toBe(84 + scale[scale.length - 1]! - 12);
  });

  it('every white key lands on a member of the current scale', () => {
    for (const [name, scale] of Object.entries(MODE_SCALES)) {
      const c = ctx(name, 45);
      for (let note = 36; note <= 96; note++) {
        if (isBlackKey(note)) continue;
        const sounded = mapPlayNote(note, c, 'scale');
        const interval = ((sounded - 45) % 12 + 12) % 12;
        const members = new Set(scale.map((s) => ((s % 12) + 12) % 12));
        expect(members.has(interval), `${name} key ${note} → ${sounded}`).toBe(true);
      }
    }
  });

  it('black keys sit a semitone above their white neighbour', () => {
    const c = ctx('lydian', 60);
    expect(mapPlayNote(61, c, 'scale')).toBe(mapPlayNote(60, c, 'scale') + 1);
    expect(mapPlayNote(66, c, 'scale')).toBe(mapPlayNote(65, c, 'scale') + 1);
  });

  it('scale tuning is monotonic across the keybed', () => {
    const c = ctx('major7', 62);
    let previous = -1;
    for (let note = 36; note <= 96; note++) {
      const sounded = mapPlayNote(note, c, 'scale');
      expect(sounded).toBeGreaterThan(previous);
      previous = sounded;
    }
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
  });

  it('names notes the way Tone reads them', () => {
    expect(midiToNoteName(60)).toBe('C4');
    expect(midiToNoteName(61)).toBe('C#4');
    expect(midiToNoteName(21)).toBe('A0');
  });
});
