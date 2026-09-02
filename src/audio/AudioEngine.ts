import * as Tone from 'tone';
import { Conductor } from './Conductor';
import type { ConductorFx } from './ConductorFx';
import { createAllVoices } from './voices';
import type { AppKnobs, AudioFeatures } from './types';
import { DEFAULT_KNOBS } from './types';
import { NEUTRAL_PRESENCE, type LayerPresence } from './LayerPresence';
import type { ConductorDirectives } from './ConductorSkill';
import type { PieceRequest } from './HarmonicField';
import { RoomWalk } from './RoomWalk';
import { NeighbourRoom } from './NeighbourRoom';
import { PlayInstrument } from './PlayInstrument';
import {
  DEFAULT_BLEND_ID,
  duckFor,
  findBlend,
  instrumentLevel,
  NO_DUCK,
  type PlayBlend,
} from './PlayBlend';

/** Mirrors the UI's AppMode without the audio layer reaching up into it. */
type EngineMode = 'drift' | 'calibrate' | 'play';

/**
 * How far the per-layer duck has to move before it is worth writing.
 *
 * The duck is continuous now — it tracks play energy every frame instead of
 * flipping between two states — so without a gate this would schedule five
 * bus ramps sixty times a second. The same reason `applyLayerPresence` has
 * one, and the same threshold: a move this small is inaudible.
 */
const DUCK_EPSILON = 0.006;

export class AudioEngine {
  private readonly padBus: Tone.Gain;
  private readonly melodyBus: Tone.Gain;
  private readonly airBus: Tone.Gain;
  private readonly subBus: Tone.Gain;
  private readonly pulseBus: Tone.Gain;
  private readonly pulseSend: Tone.Gain;
  private readonly foundationBus: Tone.Gain;
  private readonly masterBus: Tone.Gain;
  private readonly intensityGain: Tone.Gain;
  private readonly glue: Tone.Compressor;
  private readonly chorus: Tone.Chorus;
  private readonly reverb: Tone.Reverb;
  private readonly delay: Tone.FeedbackDelay;
  private readonly widener: Tone.StereoWidener;
  private readonly tiltEQ: Tone.EQ3;
  private readonly highpass: Tone.Filter;
  private readonly rumble: Tone.Filter;
  private readonly roomWall: Tone.Filter;
  private readonly roomGain: Tone.Gain;
  private readonly roomWalk = new RoomWalk();
  private neighbour: NeighbourRoom | null = null;
  private lastRoomCutoff = -1;
  private lastRoomGain = -1;
  /** Room channels published to the visual side through HarmonicContext. */
  private roomPosition = 0;
  private roomCorridor = 0;
  private doorwayPulse = 0;
  /** Movement index whose end-of-piece crossing has already been cued. */
  private forcedForMovement = -1;
  private readonly playBus: Tone.Gain;
  private readonly playLimiter: Tone.Limiter;
  private readonly playInstrument: PlayInstrument;
  /** True while play mode owns the front of the mix. */
  private playActive = false;
  private readonly playGlue: Tone.Compressor;
  private blend: PlayBlend = findBlend(DEFAULT_BLEND_ID);
  /**
   * How far each layer is pulled back behind the instrument, 1 = untouched.
   *
   * Per layer rather than one number, because a uniform duck is what made
   * playing feel like muting the orchestra: the melody and air voices are the
   * ones sharing the instrument's register and the ones that need to move,
   * while the pads carry the harmony you are playing over and the sub and the
   * beat are nowhere near you. See `PlayBlend`.
   */
  private ensembleDuck: LayerPresence = { ...NO_DUCK };
  /** Instrument bus level as of the last write — see `applyPlayLevel`. */
  private lastPlayLevel = -1;
  private readonly analyser: Tone.Analyser;
  private readonly limiter: Tone.Limiter;
  private readonly subLimiter: Tone.Limiter;
  private readonly pulseLimiter: Tone.Limiter;
  private readonly voices;
  readonly conductor: Conductor;
  private knobs: AppKnobs = {
    sound: { ...DEFAULT_KNOBS.sound },
    visual: { ...DEFAULT_KNOBS.visual },
  };
  private running = false;
  private mode: EngineMode = 'drift';
  private lastAppliedSound = { ...DEFAULT_KNOBS.sound };
  private pokeAnchorActivity = DEFAULT_KNOBS.sound.activity;
  private featureFrame = 0;
  private cachedFeatures: AudioFeatures = { bass: 0, mids: 0, highs: 0, overall: 0 };
  private readonly baseMasterGain = 0.8;
  private readonly baseDelayFeedback = 0.22;
  private readonly baseReverbWet = 0.42;
  private spaceThrowTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Conductor-driven session dynamics (0–1, scales the whole mix). */
  private masterIntensity = 1;
  /** Conductor-driven stereo image (0 = mono, 1 = normal, 1.5 = wide). */
  private masterStereoWidth = 1;
  private readonly baseWidth = 0.55;
  /**
   * Bus gains as the knobs alone would set them. The foreground rotation
   * multiplies these rather than overwriting them, so a Density push and a
   * swell compose instead of clobbering each other frame by frame.
   */
  private baseBusGains: LayerPresence = { pad: 0.7, melody: 0.62, air: 0.35, sub: 0.42, pulse: 0.8 };
  private layerPresence: LayerPresence = { ...NEUTRAL_PRESENCE };

  constructor() {
    this.padBus = new Tone.Gain(0.72);
    this.melodyBus = new Tone.Gain(0.68);
    this.airBus = new Tone.Gain(0.35);
    this.masterBus = new Tone.Gain(this.baseMasterGain);
    this.intensityGain = new Tone.Gain(1);
    this.glue = new Tone.Compressor({ threshold: -20, ratio: 2, attack: 0.12, release: 0.55 });

    this.chorus = new Tone.Chorus({
      frequency: 0.08,
      delayTime: 3.5,
      depth: 0.55,
      wet: 0.38,
    }).start();

    this.reverb = new Tone.Reverb({ decay: 14, wet: this.baseReverbWet });
    this.delay = new Tone.FeedbackDelay('4n.', this.baseDelayFeedback);
    this.widener = new Tone.StereoWidener(0.55);
    this.tiltEQ = new Tone.EQ3(-1, 0, 1);
    this.highpass = new Tone.Filter(90, 'highpass');
    // The last thing before the limiter, and the only thing guarding the
    // bottom of the mix.
    //
    // The 90Hz highpass above protects the pad and melody path, but the two
    // paths carrying the actual low end — the dry sub and the dry beat — both
    // take a shortcut past it on purpose, because a 90Hz highpass would erase
    // what they are for. That left nothing at all below them, and sub-audible
    // energy is not harmless: it is inaudible on every speaker anyone is
    // likely to be using, so it never arrives as a note, but it still moves
    // the cone, still spends headroom, and still intermodulates with what you
    // *can* hear — the whole mix going gritty on the low notes rather than
    // just the low notes going gritty. 30Hz sits below the deepest thing here
    // that is meant to be heard (36Hz), so it takes only what nothing was
    // going to reproduce.
    this.rumble = new Tone.Filter(30, 'highpass', -24);
    this.limiter = new Tone.Limiter(-2);
    this.analyser = new Tone.Analyser('fft', 512);

    this.padBus.connect(this.chorus);
    this.melodyBus.connect(this.chorus);
    this.airBus.connect(this.chorus);
    this.chorus.connect(this.masterBus);
    this.masterBus.connect(this.intensityGain);
    this.intensityGain.connect(this.glue);

    // The room you are standing in also gets muffled as you drift toward
    // the doorway — without this the neighbour would just fade up over an
    // undimmed main mix, which reads as a layer rather than as a wall.
    this.roomWall = new Tone.Filter(18000, 'lowpass', -24);
    this.roomGain = new Tone.Gain(1);
    this.glue.connect(this.roomWall);
    this.roomWall.connect(this.roomGain);
    this.roomGain.connect(this.highpass);
    this.highpass.connect(this.delay);
    this.delay.connect(this.reverb);
    this.reverb.connect(this.widener);
    this.widener.connect(this.tiltEQ);
    this.tiltEQ.connect(this.rumble);
    this.rumble.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.toDestination();

    // Dry sub path: joins at the tilt EQ, bypassing the 90Hz highpass (which
    // would kill true sub), the 14s reverb/delay (mud), the chorus, and the
    // glue compressor (a sub must not pump the mix). Its own limiter keeps a
    // swelling sub from eating the master limiter's headroom on behalf of
    // the whole mix. Still hits the warmth tilt, the master limiter, and the
    // analyser so the visualizer's bass band sees the pressure.
    this.subBus = new Tone.Gain(0.42);
    this.subLimiter = new Tone.Limiter(-8);
    this.subBus.connect(this.subLimiter);
    this.subLimiter.connect(this.tiltEQ);

    // Dry pulse path. A 14s reverb turns a kit to mush, and the glue
    // compressor would let every kick duck the whole field, so the beat
    // takes the same shortcut as the sub — straight to the tilt EQ, with
    // its own limiter. A small parallel send into the reverb keeps it
    // sitting in the room rather than pasted on top of it.
    this.pulseBus = new Tone.Gain(0.8);
    this.pulseLimiter = new Tone.Limiter(-6);
    this.pulseBus.connect(this.pulseLimiter);
    this.pulseLimiter.connect(this.tiltEQ);
    this.pulseSend = new Tone.Gain(0.12);
    this.pulseBus.connect(this.pulseSend);
    this.pulseSend.connect(this.reverb);

    // The instrument you play. It joins the chain *after* the room wall and
    // the glue compressor and outside the intensity gain, so it shares the
    // room's delay, reverb, width and tilt — it sounds like it is in the same
    // space — but it does not get muffled when the listener drifts toward the
    // doorway and is not pumped by the ensemble's compressor. It still passes
    // the analyser, so the cymatics panel and the visual field react to what
    // you play.
    //
    // Being outside the intensity gain is routing, not exemption: the session
    // arc reaches the instrument as a level ride instead, in `applyPlayLevel`,
    // by an amount the blend sets.
    //
    // Its level is a real level, set from the blend and the session arc by
    // `applyPlayLevel`, not the unity gain the first version ran at — an
    // instrument entering at 1.0 next to layer buses sitting near 0.5 after
    // their own trims was most of what "loud" meant. The compressor ahead of
    // the limiter is the rest of it: a two-handed chord used to arrive as a
    // step into limiting, which is the harsh part, and this catches it as a
    // gentle squeeze a few dB earlier instead. It sits high and shallow on
    // purpose: a single note passes it untouched, so the velocity curve keeps
    // the dynamics it just went to the trouble of restoring.
    this.playBus = new Tone.Gain(0);
    this.playGlue = new Tone.Compressor({
      threshold: -14,
      ratio: 2.2,
      attack: 0.008,
      release: 0.24,
      knee: 10,
    });
    this.playLimiter = new Tone.Limiter(-6);
    this.playBus.connect(this.playGlue);
    this.playGlue.connect(this.playLimiter);
    this.playLimiter.connect(this.highpass);
    this.playInstrument = new PlayInstrument(this.playBus);

    // Foundation weight: the Sub knob scales the sub drone (into the pad
    // bus) together with the deep-pressure path above.
    this.foundationBus = new Tone.Gain(1);
    this.foundationBus.connect(this.padBus);

    this.voices = createAllVoices(
      this.padBus,
      this.melodyBus,
      this.airBus,
      this.subBus,
      this.foundationBus,
      this.pulseBus,
    );

    const fx: ConductorFx = {
      triggerPreEnsembleInhale: () => this.triggerPreEnsembleInhale(),
      triggerSpaceThrow: (d) => this.triggerSpaceThrow(d),
      triggerThinMix: (d) => this.triggerThinMix(d),
      triggerExhaleVacuum: () => this.triggerExhaleVacuum(),
    };
    this.conductor = new Conductor(this.voices, this.knobs.sound, fx);
    // The room next door: dry into the master bus, with its own distance
    // send into the shared reverb.
    this.neighbour = new NeighbourRoom(this.masterBus, this.reverb);
    this.setupVisibilityResume();
  }

  private setupVisibilityResume(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.running) {
        void Tone.getContext().resume();
      }
    });
  }

  async start(): Promise<void> {
    if (this.running) return;
    await Tone.start();
    await this.reverb.generate();
    Tone.getTransport().start();
    this.running = true;
    this.conductor.start();
    this.applyKnobs();
  }

  update(dt: number): void {
    if (!this.running) return;
    this.conductor.setKnobs(this.knobs.sound);
    this.conductor.update(dt);
    this.updateRooms(dt);
    this.playInstrument.syncContext(this.conductor.getHarmonicContext());
    this.playInstrument.update(dt);
    this.updateDuck();
  }

  /**
   * Advance the listener's walk between the two rooms and apply what that
   * does to each of them.
   *
   * A crossing is timed to land as a movement runs out, so arriving in the
   * other room *is* how one piece becomes the next: the main engine takes
   * the key you had been hearing through the wall, and the neighbour moves
   * on to a fresh one, both while the threshold blur is at its deepest.
   */
  private updateRooms(dt: number): void {
    const neighbour = this.neighbour;
    if (!neighbour) return;

    const ctx = this.conductor.getHarmonicContext();
    this.roomWalk.setScale(ctx.movementScale);

    const remaining = ctx.movementDurationSec - ctx.movementElapsedSec;
    const cue = Math.min(60, ctx.movementDurationSec * 0.35);
    if (remaining <= cue && this.forcedForMovement !== ctx.movementIndex) {
      this.forcedForMovement = ctx.movementIndex;
      this.roomWalk.forceCrossing();
    }

    const room = this.roomWalk.update(dt);
    this.roomPosition = room.position;
    this.roomCorridor = room.corridor;
    this.doorwayPulse = Math.max(0, this.doorwayPulse - dt * 0.5);

    if (room.doorway) {
      this.doorwayPulse = 1;
      this.conductor.crossIntoRoom(neighbour.currentSeed());
      neighbour.reseed(this.knobs.sound);
    }

    this.applyRoomAudibility(room.here);
    neighbour.update(dt, this.knobs.sound);
    neighbour.applyAudibility(room.next);
  }

  /** Muffle and dim the room you're standing in as you drift out of it. */
  private applyRoomAudibility(a: { gain: number; cutoff: number }): void {
    if (Math.abs(a.gain - this.lastRoomGain) > 0.004) {
      this.lastRoomGain = a.gain;
      this.roomGain.gain.rampTo(a.gain, 1.5);
    }
    if (Math.abs(a.cutoff - this.lastRoomCutoff) > 15) {
      this.lastRoomCutoff = a.cutoff;
      this.roomWall.frequency.rampTo(a.cutoff, 1.5);
    }
  }

  /** Room channels for the visual side — read by getHarmonicContext. */
  private roomChannels() {
    return {
      roomPosition: this.roomPosition,
      roomCorridor: this.roomCorridor,
      doorwayPulse: this.doorwayPulse,
    };
  }

  /** Play channel for the visual side — a struck chord blooms the field. */
  private playChannels() {
    return { playPulse: this.playActive ? this.playInstrument.getPulse() : 0 };
  }

  setKnobs(knobs: AppKnobs): void {
    // A deliberate Density push in calibrate should be answered by a voice
    // joining right away, not on the next randomly scheduled event.
    const activity = knobs.sound.activity;
    if (this.mode !== 'drift' && activity - this.pokeAnchorActivity > 0.1) {
      this.pokeAnchorActivity = activity;
      this.conductor.pokeScheduler();
    } else if (activity < this.pokeAnchorActivity) {
      this.pokeAnchorActivity = activity;
    }
    this.knobs = knobs;
    this.applyKnobs(true);
  }

  /** Calibrate and Play steady the tempo so the Tempo knob acts as a direct
   * lever, and switch knob ramps from slow glides to under-the-finger
   * response. Play additionally hands the front of the mix to the instrument. */
  setMode(mode: EngineMode): void {
    this.mode = mode;
    this.conductor.clock.steadyTempo = mode !== 'drift';
    this.setPlayActive(mode === 'play');
  }

  getPlayInstrument(): PlayInstrument {
    return this.playInstrument;
  }

  /**
   * Open or close the instrument's path into the mix.
   *
   * Leaving play mode releases whatever was being held — otherwise a chord
   * struck on the way out would hang forever, since nothing else is going to
   * send the note-offs.
   */
  setPlayActive(active: boolean): void {
    if (active === this.playActive) return;
    this.playActive = active;
    if (!active) {
      this.playInstrument.allNotesOff();
      this.ensembleDuck = { ...NO_DUCK };
      this.applyBusGains(1.5);
    }
    this.lastPlayLevel = -1;
    this.playBus.gain.rampTo(
      active ? instrumentLevel(this.blend, this.masterIntensity) : 0,
      active ? 0.15 : 0.6,
    );
  }

  /** How far forward the instrument sits, and how the orchestra answers it. */
  setBlend(id: string): void {
    const next = findBlend(id);
    if (next.id === this.blend.id) return;
    this.blend = next;
    this.lastPlayLevel = -1;
    if (this.playActive) this.applyPlayLevel(0.4);
  }

  getBlend(): PlayBlend {
    return this.blend;
  }

  /**
   * Pull the orchestra back behind the instrument.
   *
   * The duck is a third factor in applyBusGains alongside the knob base gains
   * and the foreground rotation, so none of the three can stomp the others —
   * the same composition the pan system uses for base pan, offset and width.
   *
   * It tracks play energy continuously instead of flipping between a floor
   * and a ceiling: the instrument's own decay is what holds the orchestra
   * back through the gaps between phrases and then lets it swell, so there is
   * no hold timer here any more, and no moment where the bed jumps because a
   * timer ran out. Ramps are short — the smoothing already happened upstream,
   * in the energy, and ramping a smooth signal again only adds lag.
   */
  private updateDuck(): void {
    const energy = this.playActive ? this.playInstrument.getEnergy() : 0;
    const next = energy > 0 ? duckFor(this.blend, energy) : NO_DUCK;
    const moved = (Object.keys(next) as (keyof LayerPresence)[]).some(
      (k) => Math.abs(next[k] - this.ensembleDuck[k]) > DUCK_EPSILON,
    );
    if (moved) {
      this.ensembleDuck = { ...next };
      this.applyBusGains(0.25);
    }
    if (this.playActive) this.applyPlayLevel();
  }

  /**
   * Ride the instrument's bus with the Conductor's session arc.
   *
   * The first version deliberately kept the instrument outside the arc —
   * "your hands are not part of the piece's dynamics" — and that is exactly
   * what made it sound pasted on: the orchestra would recede into a quiet
   * passage and the instrument would sit there at the same level, the one
   * thing in the room not breathing. It follows the arc partially now, by an
   * amount the blend sets, so it belongs to the piece without disappearing
   * into it. Everything else about the routing is unchanged: still after the
   * room wall, still outside the glue compressor, so walking toward the
   * doorway still never muffles your hands.
   */
  private applyPlayLevel(rampSec = 1.2): void {
    const level = instrumentLevel(this.blend, this.masterIntensity);
    if (Math.abs(level - this.lastPlayLevel) < 0.004) return;
    this.lastPlayLevel = level;
    this.playBus.gain.rampTo(level, rampSec);
  }

  /**
   * How far back the orchestra is being held, 0 = untouched, 1 = fully behind
   * the instrument. The readout reads this to show whether the bed is ducked.
   */
  getEnsembleDuckDepth(): number {
    const layers = Object.keys(this.ensembleDuck) as (keyof LayerPresence)[];
    let deepest = 0;
    for (const layer of layers) deepest = Math.max(deepest, 1 - this.ensembleDuck[layer]);
    return deepest;
  }

  /** Apply autonomous Conductor directives — call each frame while running. */
  applyDirectives(d: ConductorDirectives): void {
    this.setMasterIntensity(d.masterIntensity);
    this.setStereoWidth(d.stereoWidth);
    this.applyLayerPresence(d.layerPresence);
  }

  /** Session-level dynamics. Ramps a dedicated gain so it never fights gestures. */
  setMasterIntensity(value: number, rampSec = 3): void {
    const v = Math.max(0.2, Math.min(1, value));
    if (Math.abs(v - this.masterIntensity) < 0.004) return;
    this.masterIntensity = v;
    this.intensityGain.gain.rampTo(v, rampSec);
  }

  /** 0 = mono, 1 = normal, up to 1.5 = wide. Ramps to avoid zipper noise. */
  setStereoWidth(value: number, rampSec = 4): void {
    const v = Math.max(0, Math.min(1.5, value));
    if (Math.abs(v - this.masterStereoWidth) < 0.01) return;
    this.masterStereoWidth = v;
    this.applyStereoWidth(rampSec);
  }

  /** Widener + per-voice pan spread — Width knob composes with the
   * ConductorSkill's phase-driven stereo image. */
  private applyStereoWidth(rampSec = 4): void {
    const space = this.knobs.sound.space;
    const width = Math.max(
      0,
      Math.min(1, this.baseWidth * this.widthKnobFactor() * (0.7 + space * 0.55) * this.masterStereoWidth),
    );
    this.widener.width.rampTo(width, rampSec);
    this.applyVoiceWidth(rampSec);
  }

  private applyVoiceWidth(rampSec: number): void {
    const v = Math.max(0, Math.min(1.5, this.masterStereoWidth * this.widthKnobFactor()));
    for (const voice of this.voices) voice.setStereoWidth(v, rampSec);
  }

  triggerPreEnsembleInhale(): void {
    const now = Tone.now();
    this.masterBus.gain.cancelScheduledValues(now);
    this.masterBus.gain.setValueAtTime(this.masterBus.gain.value, now);
    this.masterBus.gain.linearRampToValueAtTime(this.baseMasterGain * 0.55, now + 0.75);
    this.masterBus.gain.linearRampToValueAtTime(this.baseMasterGain, now + 1.1);
    this.highpass.frequency.linearRampToValueAtTime(140, now + 0.5);
    this.highpass.frequency.linearRampToValueAtTime(90, now + 1.2);
  }

  triggerSpaceThrow(durationSec = 3): void {
    if (this.spaceThrowTimeout) clearTimeout(this.spaceThrowTimeout);
    const now = Tone.now();
    const space = this.knobs.sound.space;
    this.delay.feedback.cancelScheduledValues(now);
    this.delay.feedback.setValueAtTime(this.delay.feedback.value, now);
    this.delay.feedback.linearRampToValueAtTime(
      Math.min(0.62, this.delayFeedbackBase() + 0.28 + space * 0.12),
      now + 0.4,
    );
    this.reverb.wet.linearRampToValueAtTime(
      Math.min(0.72, this.baseReverbWet + 0.22 + space * 0.1),
      now + 0.5,
    );
    this.spaceThrowTimeout = setTimeout(() => {
      const t = Tone.now();
      this.delay.feedback.linearRampToValueAtTime(this.delayFeedbackBase(), t + 1.5);
      this.reverb.wet.linearRampToValueAtTime(
        0.2 + this.knobs.sound.space * 0.5,
        t + 1.8,
      );
      this.spaceThrowTimeout = null;
    }, durationSec * 1000);
  }

  triggerThinMix(durationSec = 1): void {
    const now = Tone.now();
    this.masterBus.gain.cancelScheduledValues(now);
    this.masterBus.gain.setValueAtTime(this.masterBus.gain.value, now);
    this.masterBus.gain.linearRampToValueAtTime(this.baseMasterGain * 0.72, now + 0.35);
    this.masterBus.gain.linearRampToValueAtTime(this.baseMasterGain, now + durationSec);
  }

  triggerExhaleVacuum(): void {
    const now = Tone.now();
    this.masterBus.gain.cancelScheduledValues(now);
    this.masterBus.gain.setValueAtTime(this.masterBus.gain.value, now);
    this.masterBus.gain.linearRampToValueAtTime(this.baseMasterGain * 0.38, now + 1.2);
    this.masterBus.gain.linearRampToValueAtTime(this.baseMasterGain * 0.85, now + 2.8);
    this.masterBus.gain.linearRampToValueAtTime(this.baseMasterGain, now + 4.2);
  }

  private applyKnobs(force = false): void {
    const s = this.knobs.sound;
    const prev = this.lastAppliedSound;

    const keys = Object.keys(s) as (keyof typeof s)[];
    if (!force && keys.every((k) => Math.abs(s[k] - prev[k]) < 0.002)) {
      return;
    }

    this.lastAppliedSound = { ...s };

    // Calibrate wants the change audible under the finger; Drift keeps its
    // slow aesthetic glides.
    const ramp = this.mode === 'drift' ? 1 : 0.12;

    this.tiltEQ.low.rampTo(-3 + s.warmth * 5, ramp);
    this.tiltEQ.high.rampTo(3 - s.warmth * 5, ramp);

    this.reverb.wet.rampTo(0.2 + s.space * 0.5, ramp);
    this.delay.wet.rampTo(0.08 + s.space * 0.26 + s.pulse * 0.06, ramp);
    this.delay.feedback.rampTo(this.delayFeedbackBase(), ramp);
    this.applyStereoWidth(ramp);
    this.chorus.wet.rampTo(0.28 + s.space * 0.22, ramp);
    // Variation as live modulation movement — depth is a plain property.
    this.chorus.depth = 0.35 + s.entropy * 0.45;

    // Live lushness trims so Density and Melody respond while dragging, not
    // only on the next composed phrase. Each trim is 1.0 at its knob's
    // default and stays within ~±2.5dB so Drift's roaming can't pump the mix.
    const melodyTrim = 0.75 + s.memory * 0.55;
    const padTrim = 0.93 + s.activity * 0.2;
    const airTrim = 0.79 + s.activity * 0.6;
    this.baseBusGains = {
      melody: (0.62 + (1 - s.space) * 0.16) * melodyTrim,
      pad: (0.7 + s.space * 0.1) * padTrim,
      air: (0.1 + s.texture * 0.5) * airTrim,
      sub: 0.15 + s.foundation * 0.54,
      pulse: 0.55 + s.pulse * 0.5,
    };
    this.applyBusGains(ramp);

    this.foundationBus.gain.rampTo(Math.min(1.25, 0.3 + s.foundation * 1.4), ramp);
  }

  /**
   * Foreground rotation from the Conductor Skill — called each frame, but
   * the rotation is slow, so skip the write until it has actually moved.
   * Scheduling five ramps sixty times a second would swamp the param queue
   * for changes nobody can hear.
   */
  applyLayerPresence(presence: LayerPresence, rampSec = 1.5): void {
    const moved = (Object.keys(presence) as (keyof LayerPresence)[]).some(
      (k) => Math.abs(presence[k] - this.layerPresence[k]) > 0.004,
    );
    if (!moved) return;
    this.layerPresence = { ...presence };
    this.applyBusGains(rampSec);
  }

  /**
   * The single writer for the layer buses. Knob settings and the foreground
   * rotation are two independent inputs, so both funnel through here and
   * neither can stomp the other — the same composition the pan system uses
   * for base pan, pan offset and stereo width.
   */
  private applyBusGains(rampSec: number): void {
    const base = this.baseBusGains;
    const p = this.layerPresence;
    const d = this.ensembleDuck;
    this.melodyBus.gain.rampTo(base.melody * p.melody * d.melody, rampSec);
    this.padBus.gain.rampTo(base.pad * p.pad * d.pad, rampSec);
    this.airBus.gain.rampTo(base.air * p.air * d.air, rampSec);
    this.subBus.gain.rampTo(base.sub * p.sub * d.sub, rampSec);
    this.pulseBus.gain.rampTo(base.pulse * p.pulse * d.pulse, rampSec);
  }

  /** Knob-derived delay feedback — gesture restores must re-read this
   * instead of the raw base or they stomp the Variation knob. */
  private delayFeedbackBase(): number {
    return Math.min(0.45, this.baseDelayFeedback * (0.6 + this.knobs.sound.entropy * 0.9));
  }

  /** Width knob factor: 0 = mono-ish/intimate, 0.5 = neutral, 1 = wide. */
  private widthKnobFactor(): number {
    return 0.45 + this.knobs.sound.width * 1.1;
  }

  getAnalyser(): Tone.Analyser {
    return this.analyser;
  }

  getSpectrum(): Float32Array {
    const raw = this.analyser.getValue();
    let data: Float32Array;

    if (raw instanceof Float32Array) {
      data = raw;
    } else if (Array.isArray(raw)) {
      data = raw[0] ?? new Float32Array(256);
    } else {
      data = new Float32Array(256);
    }

    const out = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      out[i] = Math.max(0, Math.min(1, (data[i]! + 100) / 100));
    }
    return out;
  }

  getAudioFeatures(): AudioFeatures {
    this.featureFrame++;
    if (this.featureFrame % 2 !== 0) {
      return this.cachedFeatures;
    }

    const raw = this.analyser.getValue();
    let data: Float32Array;

    if (raw instanceof Float32Array) {
      data = raw;
    } else if (Array.isArray(raw)) {
      data = raw[0] ?? new Float32Array(256);
    } else {
      data = new Float32Array(256);
    }

    let bass = 0;
    let mids = 0;
    let highs = 0;

    for (let i = 0; i < data.length; i++) {
      const val = Math.max(0, (data[i]! + 100) / 100);
      if (i < 8) bass += val;
      else if (i < 40) mids += val;
      else highs += val;
    }

    bass /= 8;
    mids /= 32;
    highs /= Math.max(1, data.length - 40);

    return this.cacheFeatures({
      bass: Math.min(1, bass),
      mids: Math.min(1, mids),
      highs: Math.min(1, highs),
      overall: Math.min(1, (bass + mids + highs) / 3),
    });
  }

  private cacheFeatures(features: AudioFeatures): AudioFeatures {
    this.cachedFeatures = features;
    return features;
  }

  /**
   * The audio context clock. Advances whenever sound is actually being
   * produced and stops when the context suspends, which makes it the only
   * honest source of engine time — a frame clock stops in a hidden tab and
   * lags on a slow one, while the music carries on either way.
   */
  audioTime(): number {
    return Tone.now();
  }

  /** Current transport tempo — surfaced for the dev PerfMonitor readout. */
  getBpm(): number {
    return Tone.getTransport().bpm.value;
  }

  isRunning(): boolean {
    return this.running;
  }

  /** True when the underlying AudioContext is actively running (PerfMonitor). */
  isContextRunning(): boolean {
    return Tone.getContext().state === 'running';
  }

  getHarmonicContext() {
    return {
      ...this.conductor.getHarmonicContext(),
      ...this.roomChannels(),
      ...this.playChannels(),
    };
  }

  requestNextPhase(): void {
    this.conductor.requestNextPhase();
  }

  requestNextMovement(): void {
    this.conductor.requestNextMovement();
  }

  /**
   * Play a specific piece next. Queues the request, then triggers the same
   * dissolve-and-skip the Mov button uses, so the current piece leaves the
   * way it always does instead of being cut.
   */
  requestPiece(request: PieceRequest): void {
    this.conductor.harmonicField.requestPiece(request);
    this.conductor.requestNextMovement();
  }

  getMovementReadoutState() {
    return {
      harmonic: this.getHarmonicContext(),
      harmonicTransitioning: this.conductor.isHarmonicTransitioning(),
      harmonicTransitionProgress: this.conductor.getHarmonicTransitionProgress(),
      pendingMovementSkip: this.conductor.isPendingMovementSkip(),
    };
  }

  dispose(): void {
    if (this.spaceThrowTimeout) clearTimeout(this.spaceThrowTimeout);
    this.neighbour?.dispose();
    this.playInstrument.dispose();
    Tone.getTransport().stop();
    this.running = false;
  }
}
