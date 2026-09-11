import * as Tone from 'tone';
import { velocityCurve } from './PlayBlend';
import { ScheduleTime } from './ScheduleTime';
import type { HarmonicContext } from './types';

/**
 * What the keybed plays in Beat mode — twelve pieces to the octave, laid
 * out for a hand rather than for a scale. See `KIT_LAYOUT`.
 */
export type KitPieceId =
  | 'kick'
  | 'rim'
  | 'snare'
  | 'clap'
  | 'tomLow'
  | 'tomMid'
  | 'hatClosed'
  | 'hatOpen'
  | 'shaker'
  | 'ride'
  | 'crackle'
  | 'sub';

/**
 * Semitone within the octave → piece. The layout repeats every octave.
 *
 * The white keys carry a kit you could play a groove on with one hand —
 * kick, snare, the two hats, two toms, ride — in that order, because those
 * are the pieces a hand reaches for without looking. The black keys hold
 * the colour: the sub, the clap, the shaker, the rim, the crackle.
 */
export const KIT_LAYOUT: KitPieceId[] = [
  'kick', // C
  'sub', // C#
  'snare', // D
  'clap', // D#
  'hatClosed', // E
  'hatOpen', // F
  'shaker', // F#
  'tomLow', // G
  'rim', // G#
  'tomMid', // A
  'crackle', // A#
  'ride', // B
];

export const KIT_LABELS: Record<KitPieceId, string> = {
  kick: 'Kick',
  rim: 'Rim',
  snare: 'Snare',
  clap: 'Clap',
  tomLow: 'Tom lo',
  tomMid: 'Tom hi',
  hatClosed: 'Hat',
  hatOpen: 'Open hat',
  shaker: 'Shaker',
  ride: 'Ride',
  crackle: 'Crackle',
  sub: 'Sub',
};

export function kitPieceFor(midiNote: number): KitPieceId {
  const index = ((midiNote % 12) + 12) % 12;
  return KIT_LAYOUT[index]!;
}

/**
 * The kit you play, as against the kit the Conductor plays.
 *
 * Same argument as the melodic presets: these are playable readings of
 * drums the orchestra already owns, voiced for a finger rather than for a
 * sequencer. The pitched pieces — kick, toms, sub — take their pitch from
 * the field's current root, so a played kick is in the key of whatever is
 * going on, which is the whole reason the generative kit sounds like part
 * of the piece and a sampled one wouldn't.
 *
 * Everything here is monophonic and voiced with `sustain: 0`, so each piece
 * gets its own ScheduleTime and each hit is an attack with no release to
 * collide with — see PulseKit, which learned that the expensive way.
 */
export class PlayKit {
  private readonly output: Tone.Gain;
  private kick: Tone.MembraneSynth | null = null;
  private tom: Tone.MembraneSynth | null = null;
  private sub: Tone.MembraneSynth | null = null;
  private snare: Tone.NoiseSynth | null = null;
  private snareFilter: Tone.Filter | null = null;
  private clap: Tone.NoiseSynth | null = null;
  private clapFilter: Tone.Filter | null = null;
  private hatClosed: Tone.NoiseSynth | null = null;
  private hatOpen: Tone.NoiseSynth | null = null;
  private hatFilter: Tone.Filter | null = null;
  private shaker: Tone.NoiseSynth | null = null;
  private shakerFilter: Tone.Filter | null = null;
  private ride: Tone.MetalSynth | null = null;
  private rideFilter: Tone.Filter | null = null;
  private rim: Tone.MembraneSynth | null = null;
  private rimFilter: Tone.Filter | null = null;
  private crackle: Tone.NoiseSynth | null = null;
  private crackleFilter: Tone.Filter | null = null;
  private built = false;

  private readonly times = new Map<KitPieceId, ScheduleTime>();
  /** Physical keys currently down — the on-screen keyboard's lights. */
  private readonly held = new Set<number>();
  /** What was struck recently, newest last, for the panel to name. */
  private recent: KitPieceId[] = [];
  private recentAge = 0;
  private ctx: HarmonicContext | null = null;
  private pulse = 0;
  private energy = 0;

  constructor(destination: Tone.ToneAudioNode) {
    this.output = new Tone.Gain(1).connect(destination);
    for (const id of KIT_LAYOUT) this.times.set(id, new ScheduleTime());
  }

  syncContext(ctx: HarmonicContext): void {
    this.ctx = ctx;
  }

  getHeldKeys(): number[] {
    return [...this.held];
  }

  /** The last few pieces struck — Beat mode's answer to "what is sounding". */
  getSoundingLabels(): string[] {
    return this.recent.map((id) => KIT_LABELS[id]);
  }

  getPulse(): number {
    return this.pulse;
  }

  /**
   * How much of the kit is in use, 0–1.
   *
   * A drum has no note length, so the melodic instrument's "how many keys
   * are down" reading gives zero for a kit being played hard. This is hits
   * per unit time instead: each strike adds, and it decays over a couple of
   * bars' worth of seconds, so a rhythm holds the orchestra back for as long
   * as it is being played and lets go shortly after it stops.
   */
  getEnergy(): number {
    return this.energy;
  }

  noteOn(midiNote: number, velocity = 0.8): void {
    this.ensureBuilt();
    this.held.add(midiNote);
    const piece = kitPieceFor(midiNote);
    const shaped = velocityCurve(velocity);
    const octave = Math.floor(midiNote / 12) - 5;
    this.strike(piece, shaped, octave);

    this.recent = [...this.recent.slice(-3), piece];
    this.recentAge = 0;
    this.pulse = Math.min(1, this.pulse + 0.3 + shaped * 0.4);
    this.energy = Math.min(1, this.energy + 0.22 + shaped * 0.3);
  }

  /** Kept for symmetry with the melodic instrument: a drum is a one-shot,
   * so this only puts the key's light out. */
  noteOff(midiNote: number): void {
    this.held.delete(midiNote);
  }

  allNotesOff(): void {
    this.held.clear();
  }

  update(dt: number): void {
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt * 1.6);
    this.energy = Math.max(0, this.energy - dt * 0.55);
    if (this.recent.length === 0) return;
    this.recentAge += dt;
    if (this.recentAge > 1.6) {
      this.recent = [];
      this.recentAge = 0;
    }
  }

  dispose(): void {
    this.teardown();
    this.output.dispose();
  }

  private strike(piece: KitPieceId, velocity: number, octave: number): void {
    const at = this.times.get(piece)!.next();
    // Pitched pieces sit against the field's root, and the octave the key
    // was in nudges them: playing the same drum higher up the keybed is a
    // tighter version of it, which is how a kit is laid out anyway.
    const root = this.ctx?.rootMidi ?? 45;
    const bump = Math.max(-1, Math.min(2, octave)) * 3;

    switch (piece) {
      case 'kick':
        this.kick?.triggerAttack(midi(root - 12 + bump), at, 0.7 + velocity * 0.3);
        break;
      case 'sub':
        this.sub?.triggerAttack(midi(root - 12 + bump), at, 0.6 + velocity * 0.35);
        break;
      case 'tomLow':
        this.tom?.triggerAttack(midi(root + bump), at, velocity);
        break;
      case 'tomMid':
        this.tom?.triggerAttack(midi(root + 7 + bump), at, velocity);
        break;
      case 'rim':
        this.rim?.triggerAttack(midi(root + 24), at, velocity * 0.8);
        break;
      case 'snare':
        this.snare?.triggerAttack(at, velocity);
        break;
      case 'clap':
        this.clap?.triggerAttack(at, velocity * 0.9);
        break;
      case 'hatClosed':
        this.hatClosed?.triggerAttack(at, velocity * 0.55);
        break;
      case 'hatOpen':
        this.hatOpen?.triggerAttack(at, velocity * 0.5);
        break;
      case 'shaker':
        this.shaker?.triggerAttack(at, velocity * 0.5);
        break;
      case 'ride':
        this.ride?.triggerAttack(at, velocity * 0.3);
        break;
      case 'crackle':
        this.crackle?.triggerAttack(at, velocity * 0.6);
        break;
    }
  }

  /** Built on the first hit, not in the constructor — most sessions never
   * open Beat mode, and this is a dozen nodes. */
  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;

    this.kick = new Tone.MembraneSynth({
      pitchDecay: 0.045,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
    }).connect(this.output);

    this.sub = new Tone.MembraneSynth({
      pitchDecay: 0.12,
      octaves: 1,
      envelope: { attack: 0.004, decay: 0.9, sustain: 0, release: 0.2 },
    }).connect(this.output);

    this.tom = new Tone.MembraneSynth({
      pitchDecay: 0.03,
      octaves: 1.5,
      envelope: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.1 },
    }).connect(this.output);

    this.rimFilter = new Tone.Filter(1400, 'bandpass', -12).connect(this.output);
    this.rim = new Tone.MembraneSynth({
      pitchDecay: 0.005,
      octaves: 1,
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
    }).connect(this.rimFilter);

    this.snareFilter = new Tone.Filter(1700, 'bandpass', -12).connect(this.output);
    this.snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
    }).connect(this.snareFilter);

    this.clapFilter = new Tone.Filter(1100, 'bandpass', -12).connect(this.output);
    this.clap = new Tone.NoiseSynth({
      noise: { type: 'white' },
      // The slow front edge is the clap: several hands not quite together.
      envelope: { attack: 0.012, decay: 0.19, sustain: 0 },
    }).connect(this.clapFilter);

    this.hatFilter = new Tone.Filter(7000, 'highpass', -24).connect(this.output);
    this.hatClosed = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0 },
    }).connect(this.hatFilter);
    this.hatOpen = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.26, sustain: 0 },
    }).connect(this.hatFilter);

    this.shakerFilter = new Tone.Filter(5200, 'highpass', -24).connect(this.output);
    this.shaker = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.002, decay: 0.06, sustain: 0 },
    }).connect(this.shakerFilter);

    this.rideFilter = new Tone.Filter(3800, 'highpass', -12).connect(this.output);
    this.ride = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.7, release: 0.2 },
      harmonicity: 5.1,
      modulationIndex: 24,
      resonance: 5200,
      octaves: 1.4,
    }).connect(this.rideFilter);

    this.crackleFilter = new Tone.Filter(2600, 'bandpass', -12).connect(this.output);
    this.crackle = new Tone.NoiseSynth({
      noise: { type: 'brown' },
      envelope: { attack: 0.001, decay: 0.09, sustain: 0 },
    }).connect(this.crackleFilter);
  }

  private teardown(): void {
    const nodes: (Tone.ToneAudioNode | null)[] = [
      this.kick,
      this.sub,
      this.tom,
      this.rim,
      this.rimFilter,
      this.snare,
      this.snareFilter,
      this.clap,
      this.clapFilter,
      this.hatClosed,
      this.hatOpen,
      this.hatFilter,
      this.shaker,
      this.shakerFilter,
      this.ride,
      this.rideFilter,
      this.crackle,
      this.crackleFilter,
    ];
    for (const node of nodes) {
      try {
        node?.dispose();
      } catch {
        /* already disposed */
      }
    }
    this.built = false;
  }
}

function midi(note: number): number {
  return Tone.Frequency(note, 'midi').toFrequency();
}
