import * as Tone from 'tone';
import type { MovementCharacter, MovementPhase, NightGroove, SoundKnobs } from './types';

/** The fastest the transport ever runs — 2-step tempo. */
export const MAX_BPM = 140;

/** The engine's resting pulse, and the anchor the melodic stretch targets. */
export const RESTING_BPM = 58;

/**
 * Where each night groove sits, and how far the knob moves it.
 *
 * Every one of these is a narrow band that the Tempo knob nudges within
 * rather than a range it sweeps. A groove is a tempo as much as it is a
 * pattern: house slowed to 100 is not slow house, and 2-step at 120 is not
 * 2-step. Chicago ran a little under where garage sits, Detroit a little
 * over, and the 2-step keeps the band it always had.
 */
const GROOVE_TEMPO: Record<NightGroove, { base: number; span: number }> = {
  'two-step': { base: 128, span: 10 },
  house: { base: 120, span: 7 },
  techno: { base: 130, span: 10 },
};

/**
 * Target BPM for a phase. Steady (Calibrate) mode trades the wide per-phase
 * sway for a wider Tempo-knob range, so the knob reads as a direct lever —
 * and that lever now reaches all the way to club tempo.
 *
 * A night piece ignores the drift-mode resting range entirely and sits in
 * its groove's band whatever the knob is doing.
 */
export function bpmFor(
  phase: MovementPhase,
  pulse: number,
  steady: boolean,
  character: MovementCharacter = 'open',
  groove: NightGroove = 'two-step',
): number {
  if (character === 'night') {
    // The phase sway is tiny and it is not decoration: a club track that
    // pushes two BPM into its peak and eases off at the end is doing what a
    // DJ does, and holding a tempo dead flat for ten minutes is the one way
    // to make a groove feel like a loop rather than a set.
    const { base, span } = GROOVE_TEMPO[groove];
    const sway = phase === 'bloom' ? 2 : phase === 'exhale' ? -3 : 0;
    return Math.min(MAX_BPM, base + pulse * span + sway);
  }
  const base = steady ? 46 + pulse * (MAX_BPM - 46) : 52 + pulse * 20;
  const sway = steady ? 0.25 : 1;
  switch (phase) {
    case 'drift':
      return base - 4 * sway;
    case 'gather':
      return base;
    case 'bloom':
      return base + 6 * sway;
    case 'hang':
      return base + 2 * sway;
    case 'dissolve':
      return base - 2 * sway;
    case 'exhale':
      return base - 6 * sway;
    default:
      return base;
  }
}

/**
 * How much to stretch beat-relative durations for melodic material.
 *
 * Every melodic layer here is timed in beats — melody notes fire every 1–3,
 * clips loop every bar or two. Run the transport at 140 and all of it moves
 * 2.4x faster, which is this music on fast-forward rather than a faster
 * piece of music. Burial's own construction is the answer: drums at garage
 * tempo, everything harmonic hanging at half or quarter time. So the melodic
 * side is stretched by whichever power of two brings its felt pulse back
 * closest to the resting tempo: at 140 that is half time, which lands a
 * melody note within about a fifth of the length it has at 58. Anchoring to
 * the resting tempo rather than to guessed thresholds is what keeps it
 * honest — quarter time at 140 would overshoot and make the melody *slower*
 * than it is at rest.
 */
export function harmonicBeatScale(bpm: number): number {
  const raw = Math.round(Math.log2(Math.max(1, bpm) / RESTING_BPM));
  return 2 ** Math.max(0, Math.min(2, raw));
}

export class MusicalClock {
  private lastBar = -1;
  private lastBeatInt = -1;
  private lastTargetBpm = 58;

  beatInBar = 0;
  currentBar = 0;
  subdivision = 0;
  beatPulse = 0;
  /** Calibrate mode: tempo follows the knob, phases barely sway it. */
  steadyTempo = false;
  /**
   * A follower reads the transport but never drives it. The neighbouring
   * room needs its own bar and beat counters — it runs its own arc — but
   * only one clock may set the tempo or the two fight over it.
   */
  follow = false;

  init(): void {
    Tone.getTransport().bpm.value = 58;
    Tone.getTransport().timeSignature = [4, 4];
  }

  update(
    _dt: number,
    phase: MovementPhase,
    knobs: SoundKnobs,
    character: MovementCharacter = 'open',
    groove: NightGroove = 'two-step',
  ): void {
    if (!this.follow) {
      const pulseKnob = knobs.pulse ?? 0.5;
      const targetBpm = Math.min(
        MAX_BPM,
        bpmFor(phase, pulseKnob, this.steadyTempo, character, groove),
      );
      if (Math.abs(targetBpm - this.lastTargetBpm) > 0.25) {
        Tone.getTransport().bpm.rampTo(targetBpm, 2);
        this.lastTargetBpm = targetBpm;
      }
    }

    const bpm = Tone.getTransport().bpm.value;
    const beatDur = 60 / bpm;
    const pos = Tone.getTransport().seconds;
    const totalBeats = pos / beatDur;

    this.currentBar = Math.floor(totalBeats / 4);
    this.beatInBar = Math.floor(totalBeats % 4);
    const frac = totalBeats - Math.floor(totalBeats);
    this.subdivision = Math.floor(frac * 16);

    const beatInt = Math.floor(totalBeats);
    if (beatInt !== this.lastBeatInt) {
      this.lastBeatInt = beatInt;
      this.beatPulse = this.beatInBar === 0 ? 1 : 0.35;
    } else {
      this.beatPulse = Math.max(0, this.beatPulse - _dt * 3.5);
    }
  }

  isDownbeat(): boolean {
    return this.beatInBar === 0 && this.subdivision < 2;
  }

  isNewBar(): boolean {
    const bar = this.currentBar;
    if (bar !== this.lastBar) {
      this.lastBar = bar;
      return true;
    }
    return false;
  }

  beatDurationSec(): number {
    return 60 / Tone.getTransport().bpm.value;
  }

  beatsToSeconds(beats: number): number {
    return beats * this.beatDurationSec();
  }

  /** Stretch factor for melodic material at the current tempo. */
  harmonicBeatScale(): number {
    return harmonicBeatScale(Tone.getTransport().bpm.value);
  }

}
