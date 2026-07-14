import * as Tone from 'tone';
import { Conductor } from './Conductor';
import type { ConductorFx } from './ConductorFx';
import { createAllVoices } from './voices';
import type { AppKnobs, AudioFeatures } from './types';
import { DEFAULT_KNOBS } from './types';

export class AudioEngine {
  private readonly padBus: Tone.Gain;
  private readonly melodyBus: Tone.Gain;
  private readonly airBus: Tone.Gain;
  private readonly subBus: Tone.Gain;
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
  private readonly analyser: Tone.Analyser;
  private readonly limiter: Tone.Limiter;
  private readonly subLimiter: Tone.Limiter;
  private readonly voices;
  readonly conductor: Conductor;
  private knobs: AppKnobs = {
    sound: { ...DEFAULT_KNOBS.sound },
    visual: { ...DEFAULT_KNOBS.visual },
  };
  private running = false;
  private mode: 'drift' | 'calibrate' = 'drift';
  private lastAppliedSound = { ...DEFAULT_KNOBS.sound };
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
    this.limiter = new Tone.Limiter(-2);
    this.analyser = new Tone.Analyser('fft', 512);

    this.padBus.connect(this.chorus);
    this.melodyBus.connect(this.chorus);
    this.airBus.connect(this.chorus);
    this.chorus.connect(this.masterBus);
    this.masterBus.connect(this.intensityGain);
    this.intensityGain.connect(this.glue);

    this.glue.connect(this.highpass);
    this.highpass.connect(this.delay);
    this.delay.connect(this.reverb);
    this.reverb.connect(this.widener);
    this.widener.connect(this.tiltEQ);
    this.tiltEQ.connect(this.limiter);
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
    );

    const fx: ConductorFx = {
      triggerPreEnsembleInhale: () => this.triggerPreEnsembleInhale(),
      triggerSpaceThrow: (d) => this.triggerSpaceThrow(d),
      triggerThinMix: (d) => this.triggerThinMix(d),
      triggerExhaleVacuum: () => this.triggerExhaleVacuum(),
    };
    this.conductor = new Conductor(this.voices, this.knobs.sound, fx);
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
  }

  setKnobs(knobs: AppKnobs): void {
    this.knobs = knobs;
    this.applyKnobs(true);
  }

  /** Calibrate steadies the tempo so the Tempo knob acts as a direct lever,
   * and switches knob ramps from slow glides to under-the-finger response. */
  setMode(mode: 'drift' | 'calibrate'): void {
    this.mode = mode;
    this.conductor.clock.steadyTempo = mode === 'calibrate';
  }

  /** Apply autonomous Conductor directives — call each frame while running. */
  applyDirectives(d: { masterIntensity: number; stereoWidth: number }): void {
    this.setMasterIntensity(d.masterIntensity);
    this.setStereoWidth(d.stereoWidth);
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
    const ramp = this.mode === 'calibrate' ? 0.12 : 1;

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
    this.melodyBus.gain.rampTo((0.62 + (1 - s.space) * 0.16) * melodyTrim, ramp);
    this.padBus.gain.rampTo((0.7 + s.space * 0.1) * padTrim, ramp);
    this.airBus.gain.rampTo((0.1 + s.texture * 0.5) * airTrim, ramp);

    this.subBus.gain.rampTo(0.15 + s.foundation * 0.54, ramp);
    this.foundationBus.gain.rampTo(Math.min(1.25, 0.3 + s.foundation * 1.4), ramp);
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

  isRunning(): boolean {
    return this.running;
  }

  /** True when the underlying AudioContext is actively running (PerfMonitor). */
  isContextRunning(): boolean {
    return Tone.getContext().state === 'running';
  }

  getHarmonicContext() {
    return this.conductor.getHarmonicContext();
  }

  requestNextPhase(): void {
    this.conductor.requestNextPhase();
  }

  requestNextMovement(): void {
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
    Tone.getTransport().stop();
    this.running = false;
  }
}
