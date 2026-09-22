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

/**
 * Output weight per piece, applied to the shaped velocity.
 *
 * Every piece here is a raw Tone drum synth — a MembraneSynth or a filtered
 * NoiseSynth — and those are voiced to be the loudest thing in a patch. At
 * velocity 1 and no trim a single played kick measured -0.4dBFS at this
 * kit's own output, a tom -0.1, an open hat -2.5: one finger, full scale,
 * before the bus gain that is supposed to place it in a mix. Six pieces
 * together reached +7dBFS, and the ensemble it is played over sits around
 * -25. That is not a kit in a room, it is a drum machine plugged into the
 * wrong socket, and it is what made Beat mode clip.
 *
 * These are measured trims, not guesses: each one lands a hard hit at the
 * weight its role wants against the others — the kick and the sub carry, the
 * toms sit just under them, the backbeat answers, and the hats, shaker and
 * ride are texture rather than events. A hard one-hand groove now peaks around
 * -6dBFS at this output and -9 at the speakers, which puts it in front of the
 * ensemble, where playing should be, and nowhere near the ceiling.
 */
const KIT_LEVELS: Record<KitPieceId, number> = {
  kick: 0.44,
  sub: 0.4,
  snare: 0.65,
  clap: 0.74,
  tomLow: 0.31,
  tomMid: 0.3,
  hatClosed: 0.13,
  hatOpen: 0.127,
  shaker: 0.45,
  ride: 0.034,
  rim: 0.68,
  crackle: 0.86,
};

/**
 * The ride's fundamental. MetalSynth builds six inharmonic partials as ratios
 * of it, and 200Hz is where the TR-808 cymbal model it comes from is voiced:
 * high enough that those partials carry the body of the sound up past the
 * 5.2kHz resonance, low enough that it rings like a cymbal rather than hissing.
 */
const RIDE_HZ = 200;

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
    this.strike(piece, shaped, octave, this.times.get(piece)!.next());
    this.markStruck(piece, shaped, 1);
  }

  /**
   * A hit from the step sequencer, placed on the transport's own grid.
   *
   * The difference from `noteOn` is the time and how much it counts for.
   * A played hit happens now — `ScheduleTime.next()` — while a sequenced one
   * has a transport time it must land on, or the loop stops being a loop.
   *
   * `weight` is why a running loop does not simply peg the duck. A played
   * hit is a finger and reads as one; sixteen hits a bar from a pattern you
   * set going is a *part*, and if each counted the same the orchestra would
   * lean all the way back and stay there for as long as the loop ran, whether
   * the loop was a kick every bar or a wall of sixteenths. Weighted down, the
   * ensemble makes room in proportion to how busy the pattern actually is,
   * which is the same rule the rest of the blend follows.
   */
  strikeAt(piece: KitPieceId, velocity: number, timeSec: number, weight = 0.45): void {
    this.ensureBuilt();
    const shaped = velocityCurve(velocity);
    this.strike(piece, shaped, 0, this.times.get(piece)!.atLeast(timeSec));
    this.markStruck(piece, shaped, weight);
  }

  /** What a strike does to everything that isn't sound: the panel's labels,
   * the field's bloom, and how far the orchestra leans away. */
  private markStruck(piece: KitPieceId, shaped: number, weight: number): void {
    this.recent = [...this.recent.slice(-3), piece];
    this.recentAge = 0;
    this.pulse = Math.min(1, this.pulse + (0.3 + shaped * 0.4) * weight);
    this.energy = Math.min(1, this.energy + (0.22 + shaped * 0.3) * weight);
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

  /** `at` is the schedule time, drawn by the caller: `next()` for a hit that
   * is happening now, `atLeast()` for one the transport has already placed. */
  private strike(piece: KitPieceId, velocity: number, octave: number, at: number): void {
    // Pitched pieces sit against the field's root, and the octave the key
    // was in nudges them: playing the same drum higher up the keybed is a
    // tighter version of it, which is how a kit is laid out anyway.
    const root = this.ctx?.rootMidi ?? 45;
    const bump = Math.max(-1, Math.min(2, octave)) * 3;

    // Balance and headroom in one number per piece — see `KIT_LEVELS`. The
    // velocity shapes below are the piece's *dynamics*: a kick and a sub keep
    // a floor under theirs because a drum that vanishes on a soft touch reads
    // as a dropped hit rather than a quiet one.
    const level = KIT_LEVELS[piece];

    switch (piece) {
      case 'kick':
        this.kick?.triggerAttack(midi(root - 12 + bump), at, (0.7 + velocity * 0.3) * level);
        break;
      case 'sub':
        this.sub?.triggerAttack(midi(root - 12 + bump), at, (0.6 + velocity * 0.35) * level);
        break;
      case 'tomLow':
        this.tom?.triggerAttack(midi(root + bump), at, velocity * level);
        break;
      case 'tomMid':
        this.tom?.triggerAttack(midi(root + 7 + bump), at, velocity * level);
        break;
      case 'rim':
        this.rim?.triggerAttack(midi(root + 24), at, velocity * level);
        break;
      case 'snare':
        this.snare?.triggerAttack(at, velocity * level);
        break;
      case 'clap':
        this.clap?.triggerAttack(at, velocity * level);
        break;
      case 'hatClosed':
        this.hatClosed?.triggerAttack(at, velocity * level);
        break;
      case 'hatOpen':
        this.hatOpen?.triggerAttack(at, velocity * level);
        break;
      case 'shaker':
        this.shaker?.triggerAttack(at, velocity * level);
        break;
      case 'ride':
        // Three arguments, not two.
        //
        // MetalSynth is a Monophonic, so its `triggerAttack` is
        // `(note, time, velocity)` — the same shape the kick and the toms use
        // — while every noise piece above it is an Instrument, whose signature
        // is `(time, velocity)`. Called with two arguments this read the
        // schedule time as a pitch and the velocity as an absolute time, which
        // put the whole envelope somewhere in the first second of the audio
        // context: by the time anyone pressed the key the hit had been over
        // for minutes. Hence a ride that made no sound at all.
        this.ride?.triggerAttack(RIDE_HZ, at, velocity * level);
        break;
      case 'crackle':
        this.crackle?.triggerAttack(at, velocity * level);
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
    // MetalSynth is also the one instrument in Tone with no default pitch:
    // `getDefaults()` merges Monophonic's — detune, portamento, no frequency —
    // and the constructor then builds its frequency Signal with no value, so
    // it starts at 0Hz with all six FM oscillators at DC. Every strike passes
    // `RIDE_HZ` anyway; this is so the synth is not sitting silent between
    // being built and first being played.
    this.ride.frequency.value = RIDE_HZ;

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
