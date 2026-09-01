import * as Tone from 'tone';
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
  private readonly filter: Tone.Filter;
  private tuning: PlayTuning = 'scale';
  private octaveShift = 0;
  private ctx: HarmonicContext | null = null;
  private sustaining = false;
  private bend = 0;
  private modulation = 0;
  /** Decaying 0–1 attack pulse — published into HarmonicContext for visuals. */
  private pulse = 0;
  private onNote: ((event: PlayNoteEvent) => void) | null = null;
  private disposeTimeouts: ReturnType<typeof setTimeout>[] = [];
  /** Last time handed out by `at()` — see there. */
  private lastScheduled = 0;

  constructor(destination: Tone.ToneAudioNode) {
    this.filter = new Tone.Filter(this.preset.cutoff.rest, 'lowpass', -12).connect(
      destination,
    );
    this.gain = new Tone.Gain(this.preset.gain).connect(this.filter);
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
        outgoing.releaseAll(this.at());
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
    // A light touch should still speak — this is an ambient instrument, not a
    // piano, and a pad that only whispers below half velocity reads as broken.
    const shaped = 0.25 + Math.max(0, Math.min(1, velocity)) * 0.75;

    this.held.set(midiNote, { note, pedalled: false });
    try {
      synth.triggerAttack(note, this.at(), shaped);
    } catch {
      this.held.delete(midiNote);
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
    try {
      this.synth?.triggerRelease(entry.note, this.at());
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
    try {
      this.synth?.releaseAll(this.at());
    } catch {
      /* already gone */
    }
  }

  /** Decay the attack pulse. Call each engine step. */
  update(dt: number): void {
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt * 1.6);
  }

  getPulse(): number {
    return this.pulse;
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
      this.gain.dispose();
      this.filter.dispose();
    } catch {
      /* already disposed */
    }
    this.synth = null;
  }

  /**
   * A strictly increasing schedule time.
   *
   * `Tone.now()` returns the same value for everything that happens inside one
   * tick, and Web Audio rejects two events at the identical time on the same
   * voice — "Start time must be strictly greater than previous start time".
   * A keyboard hits that constantly: re-striking a held key releases and
   * re-attacks the same pitch, and swapping preset mid-chord releases the old
   * synth in the same breath as the next note. Nudging each event a tenth of a
   * millisecond past the last keeps them ordered and stays far below anything
   * anyone could hear — a hundred events in one tick add up to 10ms.
   */
  private at(): number {
    const time = Math.max(Tone.now(), this.lastScheduled + 1e-4);
    this.lastScheduled = time;
    return time;
  }

  private buildSynth(): void {
    const synth = this.preset.create().connect(this.gain);
    synth.maxPolyphony = this.preset.maxPolyphony;
    this.synth = synth;
    this.gain.gain.rampTo(this.preset.gain, 0.08);
    this.applyBend();
    this.applyModulation();
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
