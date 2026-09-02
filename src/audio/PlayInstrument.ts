import * as Tone from 'tone';
import { advanceEnergy, chordTrim, velocityCurve } from './PlayBlend';
import { ScheduleTime } from './ScheduleTime';
import { mapPlayNote, midiToNoteName, type PlayTuning } from './PlayMapping';
import { DEFAULT_PRESET_ID, findPreset, type PlayPreset } from './PlayPresets';
import type { HarmonicContext } from './types';

/** A note currently sounding, keyed by the physical key that struck it. */
interface HeldNote {
  /** What it actually sounded — the mapping is resolved at attack, not release. */
  note: string;
  /** True once the key lifted but the sustain pedal is still holding it. */
  pedalled: boolean;
}

export interface PlayNoteEvent {
  /** The key that was struck, before mapping. */
  midiNote: number;
  /** The note it sounded, after tuning and octave shift. */
  note: string;
  velocity: number;
}

const BEND_RANGE_SEMITONES = 2;

/**
 * The polyphonic instrument at the front of play mode.
 *
 * Owns one PolySynth for the active preset and the book-keeping a keyboard
 * needs around it: which physical keys are down, which notes the sustain
 * pedal is still holding, and a decaying attack pulse the visual side reads.
 *
 * It deliberately knows nothing about where its input came from. A MIDI key,
 * a QWERTY key and a click on the on-screen keyboard all arrive as the same
 * `noteOn(midiNote, velocity)`.
 */
export class PlayInstrument {
  private synth: Tone.PolySynth | null = null;
  private preset: PlayPreset = findPreset(DEFAULT_PRESET_ID);
  private readonly held = new Map<number, HeldNote>();
  private readonly gain: Tone.Gain;
  /** Polyphony compensation — see `chordTrim`. Ramped, never written raw. */
  private readonly chordGain: Tone.Gain;
  private lastChordTrim = 1;
  private readonly filter: Tone.Filter;
  private tuning: PlayTuning = 'scale';
  private octaveShift = 0;
  private ctx: HarmonicContext | null = null;
  private sustaining = false;
  private bend = 0;
  private modulation = 0;
  /** Decaying 0–1 attack pulse — published into HarmonicContext for visuals. */
  private pulse = 0;
  /**
   * How much of the instrument is in use, 0–1 — held notes, smoothed. The
   * ensemble duck is proportional to this, so a single note and a two-handed
   * chord don't move the orchestra by the same amount.
   */
  private energy = 0;
  private onNote: ((event: PlayNoteEvent) => void) | null = null;
  private disposeTimeouts: ReturnType<typeof setTimeout>[] = [];
  /** Keeps this instrument's events strictly ordered — see `ScheduleTime`.
   * A keyboard hits that constraint constantly: re-striking a held key
   * releases and re-attacks the same pitch, and swapping preset mid-chord
   * releases the old synth in the same breath as the next note. */
  private readonly schedule = new ScheduleTime();

  constructor(destination: Tone.ToneAudioNode) {
    this.filter = new Tone.Filter(this.preset.cutoff.rest, 'lowpass', -12).connect(
      destination,
    );
    this.gain = new Tone.Gain(this.preset.gain).connect(this.filter);
    // A separate node from the preset trim so the two can't stomp each other:
    // `gain` is which voice this is, `chordGain` is how many notes of it are
    // sounding, and swapping preset mid-chord must not reset the second.
    this.chordGain = new Tone.Gain(1).connect(this.gain);
    this.buildSynth();
  }

  /** Called on every note-on from any input source. */
  setNoteListener(listener: ((event: PlayNoteEvent) => void) | null): void {
    this.onNote = listener;
  }

  /** The live harmonic field — what scale tuning follows. */
  syncContext(ctx: HarmonicContext): void {
    this.ctx = ctx;
  }

  getPreset(): PlayPreset {
    return this.preset;
  }

  getTuning(): PlayTuning {
    return this.tuning;
  }

  getOctaveShift(): number {
    return this.octaveShift;
  }

  /** Keys currently down (or pedalled), for the on-screen keyboard's lights. */
  getHeldKeys(): number[] {
    return [...this.held.keys()];
  }

  /** What is actually sounding — the mapped pitches, not the keys pressed.
   * In scale tuning those are different things, and the readout should show
   * what you are hearing. */
  getSoundingNotes(): string[] {
    return [...this.held.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, entry]) => entry.note);
  }

  isSustaining(): boolean {
    return this.sustaining;
  }

  setTuning(tuning: PlayTuning): void {
    this.tuning = tuning;
  }

  setOctaveShift(shift: number): void {
    this.octaveShift = Math.max(-3, Math.min(3, Math.round(shift)));
  }

  /**
   * Swap the sounding voice.
   *
   * The outgoing synth is released and disposed on a delay rather than torn
   * down under the fingers, so changing preset mid-chord lets the old chord
   * ring out into the new one instead of cutting it — the same deferred
   * teardown the generative voices use when they leave the mix.
   */
  setPreset(id: string): void {
    const next = findPreset(id);
    if (next.id === this.preset.id) return;
    const outgoing = this.synth;
    const tail = this.preset.releaseSec;
    this.held.clear();
    this.preset = next;
    this.synth = null;
    if (outgoing) {
      try {
        outgoing.releaseAll(this.schedule.next());
      } catch {
        /* already gone */
      }
      const timeout = setTimeout(() => {
        try {
          outgoing.dispose();
        } catch {
          /* already disposed */
        }
        this.disposeTimeouts = this.disposeTimeouts.filter((t) => t !== timeout);
      }, tail * 1000);
      this.disposeTimeouts.push(timeout);
    }
    this.buildSynth();
  }

  noteOn(midiNote: number, velocity = 0.8): void {
    const synth = this.synth;
    if (!synth || !this.ctx) return;
    // Re-striking a key that is already down would stack a second voice on
    // the same pitch and leave one of them stuck when the key lifts.
    if (this.held.has(midiNote)) this.noteOff(midiNote, true);

    const sounded = mapPlayNote(midiNote, this.ctx, this.tuning, this.octaveShift);
    const note = midiToNoteName(sounded);
    const shaped = velocityCurve(velocity);

    this.held.set(midiNote, { note, pedalled: false });
    // Before the attack, not after: the trim for the chord this note is
    // joining has to be in place by the time the note speaks, or the first
    // moment of every added note is the un-compensated one.
    this.applyChordTrim();
    try {
      synth.triggerAttack(note, this.schedule.next(), shaped);
    } catch {
      this.held.delete(midiNote);
      this.applyChordTrim();
      return;
    }
    this.pulse = Math.min(1, this.pulse + 0.35 + shaped * 0.45);
    this.onNote?.({ midiNote, note, velocity: shaped });
  }

  noteOff(midiNote: number, force = false): void {
    const entry = this.held.get(midiNote);
    if (!entry) return;
    if (this.sustaining && !force) {
      // The key is up but the pedal still owns the note.
      entry.pedalled = true;
      return;
    }
    this.held.delete(midiNote);
    // The trim opens back up as the chord thins, over the same short ramp the
    // attack side uses, so lifting a finger doesn't step the rest of the chord.
    this.applyChordTrim();
    try {
      this.synth?.triggerRelease(entry.note, this.schedule.next());
    } catch {
      /* synth swapped out from under it */
    }
  }

  /** Sustain pedal (CC64). */
  setSustain(on: boolean): void {
    if (on === this.sustaining) return;
    this.sustaining = on;
    if (on) return;
    for (const [midiNote, entry] of [...this.held]) {
      if (entry.pedalled) this.noteOff(midiNote, true);
    }
  }

  /** Pitch bend, -1..1 — ±2 semitones, the usual default range. */
  setBend(value: number): void {
    this.bend = Math.max(-1, Math.min(1, value));
    this.applyBend();
  }

  /** Mod wheel, 0..1 — opens the preset's filter above its resting voice. */
  setModulation(value: number): void {
    this.modulation = Math.max(0, Math.min(1, value));
    this.applyModulation();
  }

  /** Everything off — leaving play mode, or a device disappearing mid-chord. */
  allNotesOff(): void {
    this.sustaining = false;
    this.held.clear();
    // Deliberately no `applyChordTrim()`: the chord this was trimmed for is
    // still in its release, and opening the trim back up under it would swell
    // a chord that is supposed to be dying away. The next note-on resets it,
    // where a fresh attack covers the move.
    try {
      this.synth?.releaseAll(this.schedule.next());
    } catch {
      /* already gone */
    }
  }

  /** Decay the attack pulse and advance play energy. Call each engine step. */
  update(dt: number): void {
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt * 1.6);
    this.energy = advanceEnergy(this.energy, this.held.size, dt);
  }

  getPulse(): number {
    return this.pulse;
  }

  /**
   * How much of the instrument is in use, 0–1.
   *
   * Unlike `isPlaying()` this doesn't snap back the moment the last key
   * lifts — it carries its own decay, which is what lets the ensemble duck
   * be proportional and continuous rather than a switch with a hold timer
   * bolted to it.
   */
  getEnergy(): number {
    return this.energy;
  }

  /** True while any key is down or the pedal is holding something. */
  isPlaying(): boolean {
    return this.held.size > 0;
  }

  dispose(): void {
    for (const timeout of this.disposeTimeouts) clearTimeout(timeout);
    this.disposeTimeouts = [];
    this.allNotesOff();
    try {
      this.synth?.dispose();
      this.chordGain.dispose();
      this.gain.dispose();
      this.filter.dispose();
    } catch {
      /* already disposed */
    }
    this.synth = null;
  }

  private buildSynth(): void {
    const synth = this.preset.create().connect(this.chordGain);
    synth.maxPolyphony = this.preset.maxPolyphony;
    this.synth = synth;
    this.gain.gain.rampTo(this.preset.gain, 0.08);
    this.applyBend();
    this.applyModulation();
  }

  /**
   * Ride the polyphony trim to whatever is sounding now.
   *
   * Tightening has a deadline — the trim for the chord has to be in place
   * before the chord is, so it runs inside the attack of every preset here.
   * Opening has none, and taking it slower keeps a finger lifting off a chord
   * from putting a step into the notes still ringing. The guard matters
   * either way: this runs on every note-on and note-off, and a glissando
   * would otherwise schedule a ramp per key for fractions of a decibel.
   */
  private applyChordTrim(): void {
    const trim = chordTrim(this.held.size);
    if (Math.abs(trim - this.lastChordTrim) < 0.005) return;
    const opening = trim > this.lastChordTrim;
    this.lastChordTrim = trim;
    this.chordGain.gain.rampTo(trim, opening ? 0.25 : 0.05);
  }

  private applyBend(): void {
    if (!this.synth) return;
    try {
      this.synth.set({ detune: this.bend * BEND_RANGE_SEMITONES * 100 });
    } catch {
      /* preset without a detune param */
    }
  }

  private applyModulation(): void {
    const { rest, max } = this.preset.cutoff;
    this.filter.frequency.rampTo(rest + (max - rest) * this.modulation, 0.05);
  }
}
