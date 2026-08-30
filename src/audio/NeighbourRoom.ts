import * as Tone from 'tone';
import { HarmonicField, type HarmonicSeed } from './HarmonicField';
import { MusicalClock } from './MusicalClock';
import { createRoomVoices } from './voices';
import type { SoundKnobs } from './types';
import type { VoiceBase } from './VoiceBase';
import type { RoomAudibility } from './RoomWalk';

/** Never more than this many voices next door — it is background, not a mix. */
const MAX_ACTIVE = 4;

/**
 * The room next door.
 *
 * A second generative layer running its own harmonic field, its own key and
 * its own arc, permanently audible through a filtered and reverberant bus.
 * It is not a second Conductor — it fades one voice in or out every half
 * minute or so and otherwise just plays. That is enough: you are hearing it
 * through a wall, and the point is that another set is always going on
 * somewhere you are not.
 */
export class NeighbourRoom {
  private readonly field = new HarmonicField();
  private readonly clock = new MusicalClock();
  private readonly voices: VoiceBase[];
  private readonly bus: Tone.Gain;
  private readonly wall: Tone.Filter;
  private readonly dry: Tone.Gain;
  private readonly send: Tone.Gain;

  private nextEventIn = 8;
  private lastCutoff = -1;
  private lastGain = -1;
  private lastSend = -1;

  /**
   * @param dryDest where the room's direct sound lands (the master bus)
   * @param reverbDest the shared reverb, fed by the distance send
   */
  constructor(dryDest: Tone.ToneAudioNode, reverbDest: Tone.ToneAudioNode) {
    this.bus = new Tone.Gain(0);
    this.wall = new Tone.Filter(600, 'lowpass', -24);
    this.dry = new Tone.Gain(1);
    this.send = new Tone.Gain(0.5);

    this.bus.connect(this.wall);
    this.wall.connect(this.dry);
    this.dry.connect(dryDest);
    this.wall.connect(this.send);
    this.send.connect(reverbDest);

    // Its own follower clock: the neighbour keeps its own bars, but only
    // the main room's clock is allowed to set the transport tempo.
    this.clock.follow = true;
    this.voices = createRoomVoices(this.bus);
  }

  /** The key next door — what you arrive in when you walk through. */
  currentSeed(): HarmonicSeed {
    return this.field.currentSeed();
  }

  /**
   * Move the neighbour to a fresh, unrelated key. Called after a doorway
   * crossing hands its atmosphere to the main room, so there is always a
   * different set going on next door rather than an echo of this one.
   */
  reseed(knobs: SoundKnobs): void {
    this.field.skipToNextMovement(knobs);
  }

  update(dt: number, knobs: SoundKnobs): void {
    this.field.advance(dt, this.clock, knobs);
    const ctx = this.field.current(this.clock);

    for (const voice of this.voices) {
      if (voice.isActive()) voice.syncContext(ctx);
    }

    this.nextEventIn -= dt;
    if (this.nextEventIn <= 0) {
      this.shuffle(ctx);
      this.nextEventIn = 20 + Math.random() * 40;
    }

    // A steady middling interest — the neighbour has no gestures of its own
    // to swell for, and shouldn't compete with the room you're standing in.
    for (const voice of this.voices) voice.update(dt, 0.45, knobs);
  }

  /** Apply how the room sounds from where the listener is standing. */
  applyAudibility(a: RoomAudibility, rampSec = 1.5): void {
    if (Math.abs(a.gain - this.lastGain) > 0.004) {
      this.lastGain = a.gain;
      this.bus.gain.rampTo(a.gain, rampSec);
    }
    if (Math.abs(a.cutoff - this.lastCutoff) > 15) {
      this.lastCutoff = a.cutoff;
      this.wall.frequency.rampTo(a.cutoff, rampSec);
    }
    if (Math.abs(a.reverbSend - this.lastSend) > 0.004) {
      this.lastSend = a.reverbSend;
      this.send.gain.rampTo(a.reverbSend, rampSec);
    }
  }

  private shuffle(ctx: ReturnType<HarmonicField['current']>): void {
    const active = this.voices.filter((v) => v.isActive());
    if (active.length >= MAX_ACTIVE) {
      active[Math.floor(Math.random() * active.length)]!.exit();
      return;
    }

    const dormant = this.voices.filter((v) => !v.isActive());
    if (dormant.length === 0) return;

    // Keep at least one voice sounding, otherwise the room falls silent and
    // there is nothing to hear through the wall.
    if (active.length > 1 && Math.random() < 0.3) {
      active[Math.floor(Math.random() * active.length)]!.exit();
      return;
    }
    dormant[Math.floor(Math.random() * dormant.length)]!.enter(ctx);
  }

  dispose(): void {
    for (const voice of this.voices) voice.exit();
  }
}
