import { describe, expect, it } from 'vitest';
import { PlayIntent } from './PlayIntent';

/** Hold a shape for `seconds`, in the engine's own step size. */
function hold(intent: PlayIntent, seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) intent.update(1 / 60);
}

describe('PlayIntent chord reading', () => {
  it('reads nothing when nothing is held', () => {
    const intent = new PlayIntent();
    expect(intent.readChord()).toBeNull();
    hold(intent, 5);
    expect(intent.readChord()).toBeNull();
  });

  it('voices a triad from a single indicated degree', () => {
    // The conducting move: you name a root, the ensemble builds the chord.
    const intent = new PlayIntent();
    intent.noteOn(60, 3);
    expect(intent.readChord()?.degrees).toEqual([3, 5, 7]);
  });

  it('takes the held degrees themselves once there are several', () => {
    const intent = new PlayIntent();
    intent.noteOn(60, 4);
    intent.noteOn(64, 0);
    intent.noteOn(67, 2);
    expect(intent.readChord()?.degrees).toEqual([0, 2, 4]);
  });

  it('dedupes octaves — the same degree twice is one chord tone', () => {
    const intent = new PlayIntent();
    intent.noteOn(60, 0);
    intent.noteOn(72, 0);
    intent.noteOn(64, 2);
    expect(intent.readChord()?.degrees).toEqual([0, 2]);
  });

  it('caps a held cluster at four tones', () => {
    const intent = new PlayIntent();
    [0, 1, 2, 3, 4, 5].forEach((d, i) => intent.noteOn(60 + i, d));
    expect(intent.readChord()!.degrees).toHaveLength(4);
  });

  it('gains confidence only while the shape is held unchanged', () => {
    const intent = new PlayIntent();
    intent.noteOn(60, 0);
    intent.noteOn(64, 2);
    expect(intent.readChord()!.confidence).toBe(0);
    hold(intent, 0.6);
    const partway = intent.readChord()!.confidence;
    expect(partway).toBeGreaterThan(0);
    expect(partway).toBeLessThan(1);
    hold(intent, 1.2);
    expect(intent.readChord()!.confidence).toBe(1);
  });

  it('resets confidence when the shape changes', () => {
    // A run through a chord on the way somewhere else must never read as an
    // instruction — every added note restarts the count.
    const intent = new PlayIntent();
    intent.noteOn(60, 0);
    hold(intent, 2);
    expect(intent.readChord()!.confidence).toBe(1);
    intent.noteOn(64, 2);
    expect(intent.readChord()!.confidence).toBe(0);
  });

  it('keeps confidence when a note is re-struck at the same degree', () => {
    const intent = new PlayIntent();
    intent.noteOn(60, 0);
    intent.noteOn(72, 0);
    hold(intent, 2);
    intent.noteOff(72);
    // Still degree 0 alone — the shape never actually changed.
    expect(intent.readChord()!.confidence).toBe(1);
  });
});

describe('PlayIntent phrase reading', () => {
  it('offers a finished phrase after a rest', () => {
    const intent = new PlayIntent();
    for (const [i, degree] of [0, 2, 4, 3].entries()) {
      intent.noteOn(60 + i, degree);
      intent.noteOff(60 + i);
    }
    expect(intent.takePhrase()).toBeNull();
    hold(intent, 2);
    expect(intent.takePhrase()).toEqual([0, 2, 4, 3]);
  });

  it('offers it exactly once', () => {
    const intent = new PlayIntent();
    for (const [i, degree] of [0, 2, 4].entries()) {
      intent.noteOn(60 + i, degree);
      intent.noteOff(60 + i);
    }
    hold(intent, 2);
    expect(intent.takePhrase()).not.toBeNull();
    expect(intent.takePhrase()).toBeNull();
  });

  it('ignores a stab too short to be an idea', () => {
    const intent = new PlayIntent();
    intent.noteOn(60, 0);
    intent.noteOff(60);
    intent.noteOn(62, 2);
    intent.noteOff(62);
    hold(intent, 3);
    expect(intent.takePhrase()).toBeNull();
  });

  it('does not end a phrase on the gaps between its own notes', () => {
    const intent = new PlayIntent();
    for (const [i, degree] of [0, 2, 4, 5].entries()) {
      intent.noteOn(60 + i, degree);
      intent.noteOff(60 + i);
      hold(intent, 0.4);
    }
    expect(intent.takePhrase()).toBeNull();
  });

  it('never runs longer than the melody voice can use', () => {
    const intent = new PlayIntent();
    for (let i = 0; i < 20; i++) {
      intent.noteOn(60 + i, i % 7);
      intent.noteOff(60 + i);
    }
    hold(intent, 2);
    expect(intent.takePhrase()!.length).toBeLessThanOrEqual(8);
  });

  it('does not end a phrase while a note is still held down', () => {
    // A held final note is a phrase that has not finished yet.
    const intent = new PlayIntent();
    intent.noteOn(60, 0);
    intent.noteOff(60);
    intent.noteOn(62, 2);
    intent.noteOff(62);
    intent.noteOn(64, 4);
    hold(intent, 5);
    expect(intent.takePhrase()).toBeNull();
  });

  it('drops everything on clear', () => {
    const intent = new PlayIntent();
    for (const [i, degree] of [0, 2, 4].entries()) {
      intent.noteOn(60 + i, degree);
      intent.noteOff(60 + i);
    }
    hold(intent, 2);
    intent.clear();
    expect(intent.takePhrase()).toBeNull();
    expect(intent.readChord()).toBeNull();
  });
});
