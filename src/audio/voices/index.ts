import * as Tone from 'tone';
import { createClipVoices } from '../clips';
import { isMelodyAccent } from '../HarmonicField';
import type { HarmonicContext, NightGroove, SoundKnobs } from '../types';
import { euclidean, euclideanHit } from '../Euclidean';
import { fitToStep, ScheduleTime } from '../ScheduleTime';
import { VoiceBase } from '../VoiceBase';

type Bus = Tone.ToneAudioNode;

/** Rich stacked chord bed — the harmonic foundation. Detuned saw ensemble
 * with a per-note filter swell for a bowed-string character. */
export class HarmonyBed extends VoiceBase {
  private synth: Tone.PolySynth<Tone.MonoSynth> | null = null;
  private filter: Tone.Filter | null = null;

  constructor(dest: Bus) {
    super('harmonyBed', dest, 0.19);
    this.fadeSpeed = 0.008;
    this.respondsToEnsemble = true;
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.filter = new Tone.Filter(1100, 'lowpass').connect(this.output);
    this.synth = new Tone.PolySynth(Tone.MonoSynth, {
      oscillator: { type: 'fatsawtooth', spread: 26, count: 3 },
      envelope: { attack: 6, decay: 3, sustain: 0.75, release: 18 },
      filter: { type: 'lowpass', rolloff: -12, Q: 1 },
      filterEnvelope: {
        attack: 5,
        decay: 6,
        sustain: 0.55,
        release: 14,
        baseFrequency: 220,
        octaves: 2.8,
      },
    }).connect(this.filter);
    this.synth.maxPolyphony = 10;
    this.synth.triggerAttack(this.fullVoicing(ctx), this.at(), 0.13);
  }

  /** Single source of truth for the voicing — every re-attack must play the
   * full set or the bed permanently thins over a session. */
  private fullVoicing(ctx: HarmonicContext): string[] {
    return [...this.getChordNotes(ctx, 0), ...this.getChordNotes(ctx, 1)];
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    if (!this.synth) return;
    this.synth.releaseAll();
    this.synth.triggerAttack(this.fullVoicing(ctx), this.atAfter(0.5), 0.11);
  }

  onEnsembleCue(ctx: HarmonicContext): void {
    this.ensembleAttack(this.synth, this.fullVoicing(ctx), 0.06);
  }

  onUpdate(_dt: number, _interest: number, knobs: SoundKnobs): void {
    this.rampFilter(this.filter, 500 + knobs.warmth * 2200, 3);
    if (this.state === 'sustaining' && this.sinceAttack > 45 && this.harmonicContext) {
      // Breathe, don't gesture: low velocity restores the decayed filter
      // envelopes before the bed darkens into inaudibility.
      this.ensembleAttack(this.synth, this.fullVoicing(this.harmonicContext), 0.05);
    }
  }

  onExit(): void {
    const synth = this.synth;
    const filter = this.filter;
    this.releaseAndDispose(synth, 18, filter);
    this.synth = null;
    this.filter = null;
  }
}

/** Lead melody — monophonic with OPN shimmer */
export class DreamMelody extends VoiceBase {
  private synth: Tone.FMSynth | null = null;
  private filter: Tone.Filter | null = null;
  private lastMelodyIndex = -1;
  private counterPhase = 0;
  private accentStep = 0;

  constructor(dest: Bus) {
    super('dreamMelody', dest, 0.2);
    this.fadeSpeed = 0.006;
    this.respondsToEnsemble = true;
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.filter = new Tone.Filter(3200, 'lowpass').connect(this.output);
    this.synth = new Tone.FMSynth({
      harmonicity: 2,
      modulationIndex: 0.8,
      envelope: { attack: 1.2, decay: 1.2, sustain: 0.5, release: 8 },
    }).connect(this.filter);
    this.lastMelodyIndex = ctx.melodyIndex;
    this.accentStep = 0;
    this.playMelodyNote(ctx);
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    this.lastMelodyIndex = -1;
    this.playMelodyNote(ctx);
  }

  onEnsembleCue(ctx: HarmonicContext): void {
    if (!this.synth) return;
    const note = this.getMelodyNote(ctx, 2);
    this.synth.triggerAttackRelease(note, '2n', this.at(), 0.12);
  }

  onUpdate(dt: number, interest: number, knobs: SoundKnobs): void {
    if (!this.synth || !this.harmonicContext) return;

    this.rampFilter(this.filter, 1600 + knobs.warmth * 2400, 2);

    const ctx = this.harmonicContext;
    if (ctx.melodyIndex !== this.lastMelodyIndex) {
      this.playMelodyNote(ctx);
      this.lastMelodyIndex = ctx.melodyIndex;
    }

    this.counterPhase += dt;
    if (this.counterPhase > 10 + (1 - interest) * 8) {
      this.counterPhase = 0;
      const counterDeg =
        ctx.melodyDegrees[(ctx.melodyIndex + 2) % ctx.melodyDegrees.length] ?? 2;
      const counterNote = this.noteAt(ctx, counterDeg, 2);
      this.synth.triggerAttackRelease(counterNote, '2n', this.at(), 0.07);
    }
  }

  private playMelodyNote(ctx: HarmonicContext): void {
    if (!this.synth) return;
    this.synth.triggerRelease();
    const note = this.getMelodyNote(ctx, 1);
    const accented = isMelodyAccent(ctx, this.accentStep);
    this.accentStep++;
    const vel = accented ? 0.22 + ctx.brightness * 0.08 : 0.14;
    this.synth.triggerAttack(note, this.at(), vel);
  }

  onExit(): void {
    const synth = this.synth;
    const filter = this.filter;
    synth?.triggerRelease();
    this.scheduleDispose([synth, filter], 10);
    this.synth = null;
    this.filter = null;
  }
}

export class SubDrone extends VoiceBase {
  private osc: Tone.Oscillator | null = null;
  private fifth: Tone.Oscillator | null = null;
  private fifthGain: Tone.Gain | null = null;

  constructor(dest: Bus) {
    super('subDrone', dest, 0.14);
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    const root = this.freqFromDegree(0, ctx, -1);
    const fifthFreq = this.freqFromDegree(2, ctx, -1);
    this.osc = new Tone.Oscillator(root, 'sine').connect(this.output).start();
    this.fifthGain = new Tone.Gain(0.35).connect(this.output);
    this.fifth = new Tone.Oscillator(fifthFreq, 'sine').connect(this.fifthGain).start();
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    if (!this.osc) return;
    this.osc.frequency.rampTo(this.freqFromDegree(0, ctx, -1), 20);
    this.fifth?.frequency.rampTo(this.freqFromDegree(2, ctx, -1), 20);
  }

  onUpdate(): void {}

  onExit(): void {
    this.clearPendingDispose();
    this.osc?.stop().dispose();
    this.fifth?.stop().dispose();
    this.fifthGain?.dispose();
    this.osc = null;
    this.fifth = null;
    this.fifthGain = null;
  }
}

/** Underwater pressure — a true-sub root sine (36-58Hz) on the dry subBus
 * with a tidal amplitude swell. Felt more than heard; enters on bloom. */
export class DeepPressure extends VoiceBase {
  private osc: Tone.Oscillator | null = null;
  private lfo: Tone.LFO | null = null;
  private swellGain: Tone.Gain | null = null;

  constructor(dest: Bus) {
    super('deepPressure', dest, 0.12);
    // Fast enough to be felt within ~2s of bloom onset — at 0.0004 the sub
    // needed ~5s to become audible and short blooms exited it first. The
    // 0.025Hz swell LFO still provides the tidal character.
    this.fadeSpeed = 0.0012;
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    // Swell lives on an inner gain — VoiceBase owns output.gain every frame.
    this.swellGain = new Tone.Gain(0.4).connect(this.output);
    this.lfo = new Tone.LFO({
      frequency: 0.025 + Math.random() * 0.015,
      min: 0.22,
      max: 1,
      phase: 270,
    });
    this.lfo.connect(this.swellGain.gain).start();
    this.osc = new Tone.Oscillator(this.freqFromDegree(0, ctx, -1), 'sine')
      .connect(this.swellGain)
      .start();
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    this.osc?.frequency.rampTo(this.freqFromDegree(0, ctx, -1), 25);
  }

  onUpdate(): void {}

  onExit(): void {
    this.clearPendingDispose();
    this.osc?.stop().dispose();
    this.lfo?.stop().dispose();
    this.swellGain?.dispose();
    this.osc = null;
    this.lfo = null;
    this.swellGain = null;
  }
}

export class WarmPad extends VoiceBase {
  private synth: Tone.PolySynth<Tone.MonoSynth> | null = null;
  private filter: Tone.Filter | null = null;

  constructor(dest: Bus) {
    super('warmPad', dest, 0.16);
    this.respondsToEnsemble = true;
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.filter = new Tone.Filter(900, 'lowpass').connect(this.output);
    this.synth = new Tone.PolySynth(Tone.MonoSynth, {
      oscillator: { type: 'fatsawtooth', spread: 22, count: 3 },
      envelope: { attack: 4.5, decay: 2, sustain: 0.72, release: 14 },
      filter: { type: 'lowpass', rolloff: -12, Q: 1 },
      filterEnvelope: {
        attack: 4,
        decay: 5,
        sustain: 0.5,
        release: 12,
        baseFrequency: 180,
        octaves: 2.4,
      },
    }).connect(this.filter);
    this.synth.maxPolyphony = 6;
    const notes = this.getChordNotes(ctx, 0);
    this.synth.triggerAttack(notes, this.at(), 0.15);
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    if (!this.synth) return;
    this.synth.releaseAll();
    this.synth.triggerAttack(this.getChordNotes(ctx, 0), this.atAfter(1), 0.12);
  }

  onEnsembleCue(ctx: HarmonicContext): void {
    this.ensembleAttack(this.synth, this.getChordNotes(ctx, 0), 0.08);
  }

  onUpdate(_dt: number, _interest: number, knobs: SoundKnobs): void {
    this.rampFilter(this.filter, 450 + knobs.warmth * 1600, 2);
    if (this.state === 'sustaining' && this.sinceAttack > 45 && this.harmonicContext) {
      this.ensembleAttack(this.synth, this.getChordNotes(this.harmonicContext, 0), 0.05);
    }
  }

  onExit(): void {
    const synth = this.synth;
    const filter = this.filter;
    this.releaseAndDispose(synth, 14, filter);
    this.synth = null;
    this.filter = null;
  }
}

export class GlassPad extends VoiceBase {
  private synth: Tone.PolySynth | null = null;

  constructor(dest: Bus) {
    super('glassPad', dest, 0.14);
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.synth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3,
      modulationIndex: 1.4,
      envelope: { attack: 2.5, decay: 1, sustain: 0.5, release: 12 },
    }).connect(this.output);
    this.synth.maxPolyphony = 4;
    const notes = ctx.chordDegrees.map((d) => this.noteAt(ctx, d, 2));
    this.synth.triggerAttack(notes, this.at(), 0.16);
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    if (!this.synth) return;
    this.synth.releaseAll();
    const notes = ctx.chordDegrees.map((d) => this.noteAt(ctx, d, 2));
    this.synth.triggerAttack(notes, this.atAfter(0.8), 0.14);
  }

  onUpdate(): void {}

  onExit(): void {
    const synth = this.synth;
    this.releaseAndDispose(synth, 12);
    this.synth = null;
  }
}

export class AirTexture extends VoiceBase {
  private noise: Tone.Noise | null = null;
  private filter: Tone.Filter | null = null;

  constructor(dest: Bus) {
    super('airTexture', dest, 0.08);
  }

  onEnter(): void {
    this.clearPendingDispose();
    this.filter = new Tone.Filter(1800, 'bandpass', -12).connect(this.output);
    this.noise = new Tone.Noise('pink').connect(this.filter).start();
  }

  onUpdate(_dt: number, interest: number, knobs: SoundKnobs): void {
    this.rampFilter(this.filter, 900 + knobs.warmth * 2200 + interest * 150, 1);
  }

  onExit(): void {
    this.clearPendingDispose();
    this.noise?.stop().dispose();
    this.filter?.dispose();
    this.noise = null;
    this.filter = null;
  }
}

export class DistantBell extends VoiceBase {
  private synth: Tone.FMSynth | null = null;

  constructor(dest: Bus) {
    super('distantBell', dest, 0.12, undefined, true);
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.synth = new Tone.FMSynth({
      harmonicity: 4.5,
      modulationIndex: 1.5,
      envelope: { attack: 0.15, decay: 3.5, sustain: 0.12, release: 14 },
    }).connect(this.output);
    const deg = ctx.melodyDegrees[ctx.melodyIndex] ?? this.pickDegree(ctx);
    const note = this.noteAt(ctx, deg, 2);
    this.synth.triggerAttackRelease(note, '2n', this.at(), 0.16);
  }

  onUpdate(): void {}

  onExit(): void {
    const synth = this.synth;
    synth?.triggerRelease?.();
    this.scheduleDispose([synth], 2);
    this.synth = null;
  }
}

export class TapeChoir extends VoiceBase {
  private synth: Tone.PolySynth<Tone.MonoSynth> | null = null;
  private filter: Tone.Filter | null = null;
  private wobblePhase = 0;
  private lastDetune = 0;

  constructor(dest: Bus) {
    super('tapeChoir', dest, 0.14);
    this.respondsToEnsemble = true;
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.filter = new Tone.Filter(1300, 'lowpass').connect(this.output);
    this.synth = new Tone.PolySynth(Tone.MonoSynth, {
      oscillator: { type: 'fatsawtooth', spread: 18, count: 3 },
      envelope: { attack: 5, decay: 2, sustain: 0.65, release: 16 },
      filter: { type: 'lowpass', rolloff: -12, Q: 1 },
      filterEnvelope: {
        attack: 4.5,
        decay: 5,
        sustain: 0.55,
        release: 13,
        baseFrequency: 260,
        octaves: 2.6,
      },
    }).connect(this.filter);
    this.synth.maxPolyphony = 6;
    this.synth.triggerAttack(this.fullVoicing(ctx), this.at(), 0.13);
  }

  /** Full choir voicing — re-attacks must not thin it (see HarmonyBed). */
  private fullVoicing(ctx: HarmonicContext): string[] {
    return [
      ...ctx.chordDegrees.slice(0, 3).map((d) => this.noteAt(ctx, d, 0)),
      this.getMelodyNote(ctx, 1),
    ];
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    if (!this.synth) return;
    this.synth.releaseAll();
    this.synth.triggerAttack(this.fullVoicing(ctx), this.atAfter(1.2), 0.11);
  }

  onEnsembleCue(ctx: HarmonicContext): void {
    this.ensembleAttack(this.synth, this.fullVoicing(ctx), 0.07);
  }

  onUpdate(dt: number, _interest: number, knobs: SoundKnobs): void {
    if (!this.synth) return;
    this.rampFilter(this.filter, 500 + knobs.warmth * 1600, 2);
    this.wobblePhase += dt * 0.05 * Math.PI * 2;
    const entropyWobble = knobs.entropy * 10;
    const detune = Math.sin(this.wobblePhase) * (6 + entropyWobble);
    if (Math.abs(detune - this.lastDetune) > 0.4) {
      this.synth.set({ detune });
      this.lastDetune = detune;
    }
  }

  onExit(): void {
    const synth = this.synth;
    const filter = this.filter;
    this.releaseAndDispose(synth, 16, filter);
    this.synth = null;
    this.filter = null;
  }
}

export class ModalStrings extends VoiceBase {
  private synth: Tone.PolySynth | null = null;
  private filter: Tone.Filter | null = null;

  constructor(dest: Bus) {
    super('modalStrings', dest, 0.18);
    this.respondsToEnsemble = true;
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.filter = new Tone.Filter(1600, 'bandpass').connect(this.output);
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 3, decay: 1.5, sustain: 0.55, release: 12 },
    }).connect(this.filter);
    const notes = this.getChordNotes(ctx, 0);
    this.synth.triggerAttack(notes, this.at(), 0.2);
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    if (!this.synth) return;
    this.synth.releaseAll();
    this.synth.triggerAttack(this.getChordNotes(ctx, 0), this.atAfter(0.6), 0.16);
  }

  onEnsembleCue(ctx: HarmonicContext): void {
    this.ensembleAttack(this.synth, this.getChordNotes(ctx, 0), 0.13);
  }

  onUpdate(_dt: number, _interest: number, knobs: SoundKnobs): void {
    this.rampFilter(this.filter, 900 + knobs.warmth * 1800, 2);
  }

  onExit(): void {
    const synth = this.synth;
    const filter = this.filter;
    this.releaseAndDispose(synth, 12, filter);
    this.synth = null;
    this.filter = null;
  }
}

export class CrystalCluster extends VoiceBase {
  private synth: Tone.PolySynth | null = null;

  constructor(dest: Bus) {
    super('crystalCluster', dest, 0.12);
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 2, decay: 2, sustain: 0.4, release: 8 },
    }).connect(this.output);
    const hookLen = Math.min(4, ctx.melodyDegrees.length);
    const notes = ctx.melodyDegrees.slice(0, hookLen).map((d) => this.noteAt(ctx, d, 2));
    this.synth.triggerAttack(notes, this.at(), 0.1 + ctx.brightness * 0.06);
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    if (!this.synth) return;
    this.synth.releaseAll();
    const hookLen = Math.min(4, ctx.melodyDegrees.length);
    const notes = ctx.melodyDegrees.slice(0, hookLen).map((d) => this.noteAt(ctx, d, 2));
    this.synth.triggerAttack(notes, this.atAfter(0.5), 0.08);
  }

  onUpdate(): void {}

  onExit(): void {
    const synth = this.synth;
    this.releaseAndDispose(synth, 8);
    this.synth = null;
  }
}

export class RoomTone extends VoiceBase {
  private noise: Tone.Noise | null = null;
  private filter: Tone.Filter | null = null;

  constructor(dest: Bus) {
    super('roomTone', dest, 0.05);
  }

  onEnter(): void {
    this.clearPendingDispose();
    this.filter = new Tone.Filter(900, 'bandpass').connect(this.output);
    this.noise = new Tone.Noise('pink').connect(this.filter).start();
  }

  onUpdate(_dt: number, _interest: number, knobs: SoundKnobs): void {
    this.rampFilter(this.filter, 600 + knobs.warmth * 1800, 2);
  }

  onExit(): void {
    this.clearPendingDispose();
    this.noise?.stop().dispose();
    this.filter?.dispose();
    this.noise = null;
    this.filter = null;
  }
}

export class SlowArp extends VoiceBase {
  private synth: Tone.Synth | null = null;
  private arpIndex = 0;
  private timer = 0;
  private interval = 2;
  private pattern: boolean[] = [];
  private patternStep = 0;

  constructor(dest: Bus) {
    super('slowArp', dest, 0.14);
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.synth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.8, decay: 1.2, sustain: 0.2, release: 6 },
    }).connect(this.output);
    this.arpIndex = 0;
    this.patternStep = 0;
    this.pattern = ctx.melodyAccentPattern.length
      ? ctx.melodyAccentPattern
      : [true, false, false, true, false, false, true, false];
    this.interval = this.beatInterval(ctx);
    this.playArpNote(ctx);
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    this.arpIndex = 0;
    this.pattern = ctx.melodyAccentPattern;
    this.playArpNote(ctx);
  }

  onUpdate(dt: number): void {
    if (!this.synth || !this.harmonicContext) return;
    this.timer += dt;
    if (this.timer >= this.interval) {
      this.timer = 0;
      this.interval = this.beatInterval(this.harmonicContext) * 0.5;
      this.patternStep++;
      if (euclideanHit(this.pattern, this.patternStep, 0.88)) {
        this.arpIndex =
          (this.arpIndex + 1) % this.harmonicContext.melodyDegrees.length;
        this.playArpNote(this.harmonicContext);
      }
    }
  }

  private beatInterval(ctx: HarmonicContext): number {
    const bpm = Tone.getTransport().bpm.value;
    return ctx.melodyNoteDurationBeats * (60 / bpm);
  }

  private playArpNote(ctx: HarmonicContext): void {
    const deg = ctx.melodyDegrees[this.arpIndex] ?? 0;
    const note = this.noteAt(ctx, deg, 1);
    this.synth?.triggerAttackRelease(
      note,
      fitToStep(Tone.Time('4n').toSeconds(), this.interval),
      this.at(),
      0.13,
    );
  }

  onExit(): void {
    const synth = this.synth;
    synth?.triggerRelease?.();
    this.scheduleDispose([synth], 6);
    this.synth = null;
  }
}

export class HarmonicGhost extends VoiceBase {
  private synth: Tone.PolySynth | null = null;

  constructor(dest: Bus) {
    super('harmonicGhost', dest, 0.1, undefined, true);
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.synth = new Tone.PolySynth(Tone.AMSynth, {
      harmonicity: 1.5,
      envelope: { attack: 2.5, decay: 1, sustain: 0.35, release: 12 },
    }).connect(this.output);
    const notes = ctx.chordDegrees.slice(0, 2).map((d) => this.noteAt(ctx, d, 1));
    this.synth.triggerAttack(notes, this.at(), 0.14);
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    if (!this.synth) return;
    this.synth.releaseAll();
    const notes = ctx.chordDegrees.slice(0, 2).map((d) => this.noteAt(ctx, d, 1));
    this.synth.triggerAttack(notes, this.atAfter(0.7), 0.12);
  }

  onUpdate(): void {}

  onExit(): void {
    const synth = this.synth;
    this.releaseAndDispose(synth, 12);
    this.synth = null;
  }
}

export class FieldRecording extends VoiceBase {
  private noise: Tone.Noise | null = null;
  private filter: Tone.AutoFilter | null = null;
  private lastLfoRate = -1;

  constructor(dest: Bus) {
    super('fieldRecording', dest, 0.07);
  }

  onEnter(): void {
    this.clearPendingDispose();
    this.filter = new Tone.AutoFilter({
      frequency: 0.04,
      depth: 0.5,
      baseFrequency: 600,
      octaves: 2,
    })
      .connect(this.output)
      .start();
    this.noise = new Tone.Noise('pink').connect(this.filter).start();
  }

  onUpdate(_dt: number, interest: number, knobs: SoundKnobs): void {
    const rate = 0.025 + interest * 0.03 + knobs.entropy * 0.02;
    if (Math.abs(rate - this.lastLfoRate) < 0.002) return;
    this.filter?.frequency.rampTo(rate, 2);
    this.lastLfoRate = rate;
  }

  onExit(): void {
    this.clearPendingDispose();
    this.noise?.stop().dispose();
    this.filter?.stop().dispose();
    this.noise = null;
    this.filter = null;
  }
}

export class OrchestraWhole extends VoiceBase {
  private synth: Tone.PolySynth<Tone.MonoSynth> | null = null;
  private filter: Tone.Filter | null = null;

  constructor(dest: Bus) {
    super('orchestraWhole', dest, 0.16);
    this.fadeSpeed = 0.007;
    this.respondsToEnsemble = true;
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.filter = new Tone.Filter(1300, 'lowpass').connect(this.output);
    this.synth = new Tone.PolySynth(Tone.MonoSynth, {
      oscillator: { type: 'fatsawtooth', spread: 30, count: 3 },
      envelope: { attack: 6, decay: 2, sustain: 0.8, release: 20 },
      filter: { type: 'lowpass', rolloff: -12, Q: 1 },
      filterEnvelope: {
        attack: 5.5,
        decay: 6,
        sustain: 0.55,
        release: 16,
        baseFrequency: 200,
        octaves: 3.0,
      },
    }).connect(this.filter);
    this.synth.maxPolyphony = 14;
    this.synth.triggerAttack(this.fullVoicing(ctx), this.at(), 0.12);
  }

  /** The full three-octave stack — re-attacks that drop the low octave
   * permanently rob the orchestra of its body (see HarmonyBed). */
  private fullVoicing(ctx: HarmonicContext): string[] {
    return [
      ...this.getChordNotes(ctx, -1),
      ...this.getChordNotes(ctx, 0),
      ...this.getChordNotes(ctx, 1),
    ];
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    if (!this.synth) return;
    this.synth.releaseAll();
    this.synth.triggerAttack(this.fullVoicing(ctx), this.atAfter(2), 0.1);
  }

  onEnsembleCue(ctx: HarmonicContext): void {
    const notes = [...this.fullVoicing(ctx), this.getMelodyNote(ctx, 1)];
    this.ensembleAttack(this.synth, notes, 0.09);
  }

  onUpdate(_dt: number, _interest: number, knobs: SoundKnobs): void {
    this.rampFilter(this.filter, 550 + knobs.warmth * 2400, 3);
    if (this.state === 'sustaining' && this.sinceAttack > 45 && this.harmonicContext) {
      this.ensembleAttack(this.synth, this.fullVoicing(this.harmonicContext), 0.05);
    }
  }

  onExit(): void {
    const synth = this.synth;
    const filter = this.filter;
    this.releaseAndDispose(synth, 20, filter);
    this.synth = null;
    this.filter = null;
  }
}

export class MelodicFlurry extends VoiceBase {
  private synth: Tone.Synth | null = null;
  private runIndex = 0;
  private timer = 0;
  private stepInterval = 0.14;
  private runLength = 0;
  private done = false;
  private exitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(dest: Bus) {
    super('melodicFlurry', dest, 0.16, undefined, true);
    this.fadeSpeed = 0.025;
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    if (this.exitTimer) clearTimeout(this.exitTimer);
    this.synth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.04, decay: 0.15, sustain: 0.15, release: 0.35 },
    }).connect(this.output);
    this.runIndex = 0;
    this.runLength = 8 + Math.floor(Math.random() * 7);
    this.stepInterval = 0.11 + Math.random() * 0.07;
    this.done = false;
    // Swim across the field: enter one side, cross past center, keep
    // moving through the release tail.
    const dir = Math.random() < 0.5 ? -1 : 1;
    this.startPanDrift(
      dir * (0.45 + Math.random() * 0.35),
      -dir * (0.55 + Math.random() * 0.45),
      this.runLength * this.stepInterval + 1.2,
    );
    this.playStep(ctx);
  }

  onUpdate(dt: number): void {
    this.tickPanDrift(dt);
    if (this.state === 'fadingOut') {
      this.done = true;
      return;
    }
    if (!this.synth || !this.harmonicContext || this.done) return;
    this.timer += dt;
    if (this.timer >= this.stepInterval) {
      this.timer = 0;
      this.runIndex++;
      if (this.runIndex >= this.runLength) {
        this.done = true;
        this.exitTimer = setTimeout(() => this.exit(), 400);
        return;
      }
      this.playStep(this.harmonicContext);
    }
  }

  private playStep(ctx: HarmonicContext): void {
    const deg = ctx.melodyDegrees[this.runIndex % ctx.melodyDegrees.length] ?? 0;
    const note = this.noteAt(ctx, deg, 1 + (this.runIndex % 2));
    this.synth?.triggerAttackRelease(
      note,
      fitToStep(Tone.Time('16n').toSeconds(), this.stepInterval),
      this.at(),
      0.14,
    );
  }

  onExit(): void {
    if (this.exitTimer) clearTimeout(this.exitTimer);
    this.done = true;
    const synth = this.synth;
    synth?.triggerRelease?.();
    this.scheduleDispose([synth], 0.5);
    this.synth = null;
  }

  exit(): void {
    this.done = true;
    if (this.exitTimer) clearTimeout(this.exitTimer);
    super.exit();
  }
}

/** Which drums are built and how they are voiced. */
type KitStyle = 'open' | NightGroove;

function isFourFourStyle(style: KitStyle): boolean {
  return style === 'house' || style === 'techno';
}

const EMPTY_PATTERN: boolean[] = new Array(16).fill(false);

function pickOne<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)]!;
}

/** Widest a 2-step nudge can move a hit, either way. */
const NUDGE_SPAN_SEC = 0.03;
/**
 * The same for house, and much smaller.
 *
 * Chicago's feel comes from the shuffle, not from wobble. A drum machine
 * nudged by thirty milliseconds sounds like someone who cannot play; nudged
 * by four it sounds like a machine somebody loved.
 */
const HOUSE_NUDGE_SPAN_SEC = 0.008;
/** The same for the open kit's per-hit jitter. */
const JITTER_SPAN_SEC = 0.016;

/** SparkRun's fixed step. Its note length is fitted to this, not to a bar. */
const SPARK_STEP_SEC = 0.06;

export class SparkRun extends VoiceBase {
  private synth: Tone.Synth | null = null;
  private runIndex = 0;
  private timer = 0;
  private done = false;
  private exitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(dest: Bus) {
    super('sparkRun', dest, 0.13, undefined, true);
    this.fadeSpeed = 0.03;
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    if (this.exitTimer) clearTimeout(this.exitTimer);
    this.synth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.08, sustain: 0.05, release: 0.2 },
    }).connect(this.output);
    this.runIndex = 0;
    this.done = false;
    const dir = Math.random() < 0.5 ? -1 : 1;
    this.startPanDrift(
      dir * (0.5 + Math.random() * 0.3),
      -dir * (0.6 + Math.random() * 0.4),
      1.8,
    );
    this.playStep(ctx);
  }

  onUpdate(dt: number): void {
    this.tickPanDrift(dt);
    if (this.state === 'fadingOut') {
      this.done = true;
      return;
    }
    if (!this.synth || !this.harmonicContext || this.done) return;
    this.timer += dt;
    if (this.timer >= SPARK_STEP_SEC) {
      this.timer = 0;
      this.runIndex++;
      if (this.runIndex >= 12 + Math.floor(Math.random() * 6)) {
        this.done = true;
        this.exitTimer = setTimeout(() => this.exit(), 200);
        return;
      }
      this.playStep(this.harmonicContext);
    }
  }

  private playStep(ctx: HarmonicContext): void {
    const deg =
      ctx.melodyDegrees[
        (ctx.melodyIndex + this.runIndex) % ctx.melodyDegrees.length
      ] ?? 0;
    const note = this.noteAt(ctx, deg, 2 + (this.runIndex % 2));
    // A 32nd is longer than the step below 125bpm, and the engine spends most
    // of its range under that — the run would then re-attack a mono synth
    // still releasing the note before it.
    this.synth?.triggerAttackRelease(
      note,
      fitToStep(Tone.Time('32n').toSeconds(), SPARK_STEP_SEC),
      this.at(),
      0.11,
    );
  }

  onExit(): void {
    if (this.exitTimer) clearTimeout(this.exitTimer);
    this.done = true;
    const synth = this.synth;
    synth?.triggerRelease?.();
    this.scheduleDispose([synth], 0.3);
    this.synth = null;
  }

  exit(): void {
    this.done = true;
    if (this.exitTimer) clearTimeout(this.exitTimer);
    super.exit();
  }
}

/** Felt-not-heard sub pulse — Bicep/Caribou-style heartbeat in bloom/hang. */
export class RhythmicPulse extends VoiceBase {
  private body: Tone.MembraneSynth | null = null;
  private clickNoise: Tone.NoiseSynth | null = null;
  private readonly bodyTime = new ScheduleTime();
  private readonly clickTime = new ScheduleTime();
  private clickFilter: Tone.Filter | null = null;
  private loop: Tone.Loop | null = null;
  private barCount = 0;
  private nextGap = 2;

  constructor(dest: Bus) {
    super('rhythmicPulse', dest, 0.08);
    this.fadeSpeed = 0.02;
  }

  onEnter(): void {
    this.clearPendingDispose();
    // Octaves halved alongside the fundamental moving up one, so the beater
    // sweep still starts where it did. See PulseKit's kick.
    this.body = new Tone.MembraneSynth({
      pitchDecay: 0.04,
      octaves: 1,
      envelope: { attack: 0.002, decay: 0.06, sustain: 0, release: 0.08 },
    }).connect(this.output);
    this.clickFilter = new Tone.Filter(300, 'bandpass', -12).connect(this.output);
    this.clickNoise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.02, sustain: 0 },
    }).connect(this.clickFilter);
    this.barCount = 0;
    this.nextGap = 2 + Math.floor(Math.random() * 3); // every 2–4 bars
    this.loop = new Tone.Loop((time) => this.tick(time), '1m').start('+0.1');
  }

  private tick(time: number): void {
    if (this.body?.disposed) return;
    this.barCount++;
    if (this.barCount < this.nextGap) return;
    this.barCount = 0;
    this.nextGap = 2 + Math.floor(Math.random() * 3);
    const root = this.harmonicContext
      ? Tone.Frequency(this.harmonicContext.rootMidi - 12, 'midi').toFrequency()
      : 45;
    // Attack only — both are voiced with `sustain: 0`. See PulseKit's tick.
    this.body?.triggerAttack(root, this.bodyTime.atLeast(time), 0.9);
    this.clickNoise?.triggerAttack(this.clickTime.atLeast(time + 0.005), 0.25);
  }

  onUpdate(): void {}

  onExit(): void {
    this.loop?.stop().dispose();
    this.loop = null;
    this.scheduleDispose([this.body, this.clickNoise, this.clickFilter], 0.4);
    this.body = null;
    this.clickNoise = null;
    this.clickFilter = null;
  }
}

/** Aphex/Nosaj-style micro-granular degradation — surfaces in dissolve/exhale. */
export class GranularTexture extends VoiceBase {
  private synth: Tone.PolySynth | null = null;
  private crusher: Tone.BitCrusher | null = null;
  private grainDelay: Tone.FeedbackDelay | null = null;
  private loop: Tone.Loop | null = null;

  constructor(dest: Bus) {
    super('granularTexture', dest, 0.1);
    this.fadeSpeed = 0.01;
  }

  onEnter(): void {
    this.clearPendingDispose();
    this.grainDelay = new Tone.FeedbackDelay('16n', 0.35).connect(this.output);
    this.crusher = new Tone.BitCrusher(6).connect(this.grainDelay);
    this.crusher.wet.value = 0.5;
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.005, decay: 0.04, sustain: 0, release: 0.05 },
    }).connect(this.crusher);
    this.synth.maxPolyphony = 12;
    this.loop = new Tone.Loop((time) => this.grain(time), '16n').start('+0.1');
  }

  private grain(time: number): void {
    if (!this.synth || !this.harmonicContext) return;
    if (Math.random() > 0.55) return; // scatter grains in time
    const ctx = this.harmonicContext;
    const deg = ctx.scale[Math.floor(Math.random() * ctx.scale.length)] ?? 0;
    const oct = 1 + Math.floor(Math.random() * 3);
    const note = Tone.Frequency(ctx.rootMidi + deg + oct * 12, 'midi').toFrequency();
    const dur = 0.02 + Math.random() * 0.04;
    this.synth.triggerAttackRelease(note, dur, time, 0.12 + Math.random() * 0.1);
  }

  onUpdate(): void {}

  onExit(): void {
    this.loop?.stop().dispose();
    this.loop = null;
    this.releaseAndDispose(this.synth, 0.4, this.crusher, this.grainDelay);
    this.synth = null;
    this.crusher = null;
    this.grainDelay = null;
  }
}

/** Turn explicit step indices into a 16-step boolean grid. */
function stepsToPattern(steps: number[], length = 16): boolean[] {
  const out = new Array(length).fill(false);
  for (const st of steps) out[((st % length) + length) % length] = true;
  return out;
}

/**
 * A fixed timing offset per step, drawn once per pattern and then kept.
 *
 * Burial sequences by eye rather than to a grid, so his hits aren't
 * randomly jittered — they are consistently, reproducibly in the wrong
 * place, and the same wrong place every bar. That is what makes the groove
 * feel handmade instead of merely loose: random jitter per hit just sounds
 * sloppy, whereas a stable offset becomes part of the pattern.
 */
function fixedNudges(length = 16, span = NUDGE_SPAN_SEC): number[] {
  const out: number[] = [];
  for (let i = 0; i < length; i++) out.push((Math.random() - 0.45) * span);
  return out;
}

/**
 * A soft kit that can actually carry a section — filtered kick, shaker and
 * a woody click on rotating euclidean patterns, swung and humanised so it
 * breathes rather than marches. Only movements drawn with a 'kit' pulse
 * profile ever hear it; roughly half carry no beat at all.
 */
export class PulseKit extends VoiceBase {
  private kick: Tone.MembraneSynth | null = null;
  /** Closed hi-hat on a four-four kit; the shaker on an open one. */
  private hat: Tone.NoiseSynth | null = null;
  private hatFilter: Tone.Filter | null = null;
  /** The offbeat open hat — the sound four-on-the-floor is built around. */
  private openHat: Tone.NoiseSynth | null = null;
  private openHatFilter: Tone.Filter | null = null;
  private click: Tone.MembraneSynth | null = null;
  private clickFilter: Tone.Filter | null = null;
  /** Night's backbeat: a short noise burst, where open uses a woody click. */
  private snare: Tone.NoiseSynth | null = null;
  private snareFilter: Tone.Filter | null = null;
  /** The hands, and the room they are in — see `fireClap`. */
  private clap: Tone.NoiseSynth | null = null;
  private clapFilter: Tone.Filter | null = null;
  private clapTail: Tone.NoiseSynth | null = null;
  private clapTailFilter: Tone.Filter | null = null;
  private loop: Tone.Loop | null = null;
  /**
   * One clock per drum, not one for the kit.
   *
   * The constraint is per node — a snare hit and a hat hit at the same instant
   * are fine and normal — so a shared clock would push unrelated drums apart
   * for no reason. Each drum only has to stay ordered against itself.
   */
  private readonly kickTime = new ScheduleTime();
  private readonly hatTime = new ScheduleTime();
  private readonly openHatTime = new ScheduleTime();
  private readonly clickTime = new ScheduleTime();
  private readonly snareTime = new ScheduleTime();
  private readonly clapTime = new ScheduleTime();
  private readonly clapTailTime = new ScheduleTime();

  private kickPattern: boolean[] = [];
  private hatPattern: boolean[] = [];
  private openHatPattern: boolean[] = [];
  private clapPattern: boolean[] = [];
  private clickPattern: boolean[] = [];
  private step = 0;
  private bars = 0;
  private swing = 0.4;
  /** Fixed per-step offsets on a night pattern; null means grid + jitter. */
  private nudges: number[] | null = null;
  /** Which kit is currently built — the voicings differ, not just the parts. */
  private builtStyle: KitStyle = 'open';
  /** True while the open hat is ringing and the next hat should choke it. */
  private openHatRinging = false;

  constructor(dest: Bus) {
    super('pulseKit', dest, 0.5);
    this.fadeSpeed = 0.014;
  }

  onEnter(): void {
    this.clearPendingDispose();
    this.buildKit(this.style());
    this.step = 0;
    this.bars = 0;
    this.rollPatterns();
    this.loop = new Tone.Loop((time) => this.tick(time), '16n').start('+0.1');
  }

  /**
   * Which kit this is.
   *
   * Read from the harmonic context rather than stored at entry, because the
   * kit outlives a movement: it is night-core, so the trimmer leaves it
   * alone, and a piece can hand over to one in a different world underneath
   * it. `onUpdate` watches for that and rebuilds.
   */
  private style(): KitStyle {
    const ctx = this.harmonicContext;
    if (!ctx || ctx.character !== 'night') return 'open';
    return ctx.nightGroove;
  }

  /**
   * Build the drums for one style.
   *
   * The parts differ between these kits, but so do the voicings, and the
   * voicings are most of it. A house kick and a 2-step kick are not the same
   * drum playing a different pattern: one is a round punch with a tail you
   * can lean on, the other a thud placed just so. Detroit's is longer and
   * harder again, because at 130 with nothing swinging, the kick is carrying
   * the whole record.
   */
  private buildKit(style: KitStyle): void {
    const kickSpec = {
      open: { pitchDecay: 0.05, decay: 0.24, release: 0.12 },
      'two-step': { pitchDecay: 0.05, decay: 0.24, release: 0.12 },
      house: { pitchDecay: 0.032, decay: 0.34, release: 0.16 },
      techno: { pitchDecay: 0.026, decay: 0.42, release: 0.2 },
    }[style];

    // `octaves` is 2, not 3, because the kick's fundamental moved up an
    // octave (see `tick`). The beater sweep still starts in the same place it
    // always did — 4x a 37-58Hz root is the 147-233Hz it used to reach from
    // 8x an 18-29Hz one — so the attack is unchanged and only the body moved.
    this.kick = new Tone.MembraneSynth({
      pitchDecay: kickSpec.pitchDecay,
      octaves: 2,
      envelope: { attack: 0.001, decay: kickSpec.decay, sustain: 0, release: kickSpec.release },
    }).connect(this.output);

    const fourFour = style === 'house' || style === 'techno';

    // A closed hat is brighter and shorter than the shaker it replaces; a
    // techno hat is shorter still, because at sixteenths anything with a tail
    // smears into a hiss.
    this.hatFilter = new Tone.Filter(fourFour ? 7000 : 5200, 'highpass', -24).connect(
      this.output,
    );
    this.hat = new Tone.NoiseSynth({
      noise: { type: fourFour ? 'white' : 'pink' },
      envelope: {
        attack: 0.001,
        decay: style === 'techno' ? 0.024 : fourFour ? 0.032 : 0.035,
        sustain: 0,
      },
    }).connect(this.hatFilter);

    // The open hat is the one drum here with a sustain, and it needs one: it
    // rings until the next hat closes it, which is a hi-hat pedal and not a
    // decay envelope. See the choke in `tick`.
    this.openHatFilter = new Tone.Filter(6400, 'highpass', -24).connect(this.output);
    this.openHat = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.16, sustain: 0.3, release: 0.14 },
    }).connect(this.openHatFilter);

    this.clickFilter = new Tone.Filter(900, 'bandpass', -12).connect(this.output);
    this.click = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 1,
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.03 },
    }).connect(this.clickFilter);

    this.snareFilter = new Tone.Filter(1800, 'bandpass', -12).connect(this.output);
    this.snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.13, sustain: 0 },
    }).connect(this.snareFilter);

    // Two nodes, because a clap is two things: the hands, which are several
    // short bursts a few milliseconds apart, and the room they are in, which
    // is one longer one underneath. Build it from a single burst and you get
    // a snare.
    this.clapFilter = new Tone.Filter(1500, 'bandpass', -12).connect(this.output);
    this.clapFilter.Q.value = 1.1;
    this.clap = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0 },
    }).connect(this.clapFilter);

    this.clapTailFilter = new Tone.Filter(1150, 'bandpass', -12).connect(this.output);
    this.clapTail = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.003, decay: style === 'house' ? 0.21 : 0.15, sustain: 0 },
    }).connect(this.clapTailFilter);

    this.builtStyle = style;
    this.openHatRinging = false;
  }

  private teardownKit(): void {
    this.scheduleDispose(
      [
        this.kick,
        this.hat,
        this.hatFilter,
        this.openHat,
        this.openHatFilter,
        this.click,
        this.clickFilter,
        this.snare,
        this.snareFilter,
        this.clap,
        this.clapFilter,
        this.clapTail,
        this.clapTailFilter,
      ],
      0.5,
    );
    this.kick = null;
    this.hat = null;
    this.hatFilter = null;
    this.openHat = null;
    this.openHatFilter = null;
    this.click = null;
    this.clickFilter = null;
    this.snare = null;
    this.snareFilter = null;
    this.clap = null;
    this.clapFilter = null;
    this.clapTail = null;
    this.clapTailFilter = null;
  }

  /** Fresh spreads, re-rolled every eight bars so it evolves. */
  private rollPatterns(): void {
    switch (this.style()) {
      case 'house':
        return this.rollHouse();
      case 'techno':
        return this.rollTechno();
      case 'two-step':
        return this.rollTwoStep();
      default:
        return this.rollOpen();
    }
  }

  private rollOpen(): void {
    const kickPulses = 3 + Math.floor(Math.random() * 3); // 3–5
    const hatPulses = 7 + Math.floor(Math.random() * 5); // 7–11
    const clickPulses = 2 + Math.floor(Math.random() * 2); // 2–3
    this.kickPattern = euclidean(kickPulses, 16, Math.floor(Math.random() * 4));
    this.hatPattern = euclidean(hatPulses, 16, Math.floor(Math.random() * 16));
    this.clickPattern = euclidean(clickPulses, 16, 3 + Math.floor(Math.random() * 10));
    this.openHatPattern = EMPTY_PATTERN;
    this.clapPattern = EMPTY_PATTERN;
    this.swing = 0.25 + Math.random() * 0.4;
    this.nudges = null;
  }

  /**
   * 2-step. The genre's defining move is what the kick *doesn't* do: it
   * lands on the one and then skips the third beat entirely, dropping
   * somewhere in its second half instead, so the bar lurches rather than
   * marches. The snare holds the backbeat flat against that on 2 and 4,
   * and the hats fill the gaps unevenly.
   */
  private rollTwoStep(): void {
    const KICKS = [
      [0, 6, 10],
      [0, 7],
      [0, 6, 11],
      [0, 10],
      [0, 3, 10],
    ];
    const HATS = [
      [2, 3, 6, 7, 10, 11, 14],
      [2, 6, 7, 10, 14, 15],
      [1, 2, 6, 9, 10, 14],
      [2, 3, 7, 10, 11, 13, 14],
    ];
    const GHOSTS = [[7, 15], [11], [3, 13], [7]];

    this.kickPattern = stepsToPattern(pickOne(KICKS));
    this.hatPattern = stepsToPattern(pickOne(HATS));
    // Garage has an open hat too, but sparingly — one a bar, in a gap.
    this.openHatPattern =
      Math.random() < 0.55 ? stepsToPattern([pickOne([6, 11, 14])]) : EMPTY_PATTERN;
    this.clapPattern = EMPTY_PATTERN;
    this.clickPattern = stepsToPattern([4, 12, ...pickOne(GHOSTS)]);
    this.swing = 0.55 + Math.random() * 0.3;
    this.nudges = fixedNudges(16, NUDGE_SPAN_SEC);
  }

  /**
   * Chicago. Four on the floor, and the kick does not move — every bar, every
   * eight bars, every time. That is not a lack of invention: the whole style
   * is built on a floor that never shifts so everything above it can, and a
   * four-four that occasionally skips a beat is not four-four, it is a
   * mistake.
   *
   * What moves is the offbeat. The open hat on the "and" of every beat is the
   * sound — the kick pushes, the hat answers, and between them they walk. The
   * clap lands on 2 and 4 and sometimes doubles a sixteenth late, which is
   * two people clapping rather than a machine.
   *
   * And it shuffles. The swung sixteenth is the whole difference between
   * Chicago and a drum machine left on its factory setting, and it is why
   * this is the one groove here that gets a heavy swing and a little
   * humanising on top.
   */
  private rollHouse(): void {
    this.kickPattern = stepsToPattern([0, 4, 8, 12]);
    this.openHatPattern = stepsToPattern(
      pickOne([
        [2, 6, 10, 14],
        [2, 6, 10, 14],
        [2, 6, 14],
        [2, 10, 14],
      ]),
    );
    this.hatPattern = stepsToPattern(
      pickOne([
        [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15],
        [1, 3, 5, 7, 9, 11, 13, 15],
        [0, 1, 3, 5, 7, 8, 9, 11, 13, 15],
      ]),
    );
    this.clapPattern = stepsToPattern(Math.random() < 0.25 ? [4, 12, 13] : [4, 12]);
    this.clickPattern = stepsToPattern(pickOne([[7], [3, 11], [15], [7, 15], []]));
    this.swing = 0.72 + Math.random() * 0.36;
    this.nudges = fixedNudges(16, HOUSE_NUDGE_SPAN_SEC);
  }

  /**
   * Detroit. The same floor, held dead straight.
   *
   * Everything Chicago does with shuffle and hands, this does with
   * relentlessness: sixteenths that do not let up, a clap that sometimes
   * comes only on the 4 so the bar leans forward into it, and rim hits
   * syncopated against a grid that never gives. It gets no swing and no
   * humanising at all — an explicit array of zeroes rather than the open
   * kit's random jitter, because the machine being exactly a machine is the
   * feeling, and eight milliseconds of wobble is enough to lose it.
   */
  private rollTechno(): void {
    this.kickPattern = stepsToPattern([0, 4, 8, 12]);
    this.openHatPattern = stepsToPattern(
      pickOne([
        [2, 6, 10, 14],
        [6, 14],
        [2, 6, 10, 14],
        [10, 14],
      ]),
    );
    this.hatPattern =
      Math.random() < 0.55
        ? stepsToPattern([...Array(16).keys()])
        : stepsToPattern([0, 2, 4, 6, 8, 10, 12, 14]);
    this.clapPattern = stepsToPattern(Math.random() < 0.4 ? [12] : [4, 12]);
    this.clickPattern = stepsToPattern(
      pickOne([
        [3, 11],
        [7, 13],
        [3, 7, 11, 15],
        [5, 13],
      ]),
    );
    this.swing = Math.random() * 0.12;
    this.nudges = new Array(16).fill(0);
  }

  private tick(time: number): void {
    // The transport can hand this callback out after the kit has left and
    // torn its drums down. Nothing out here catches a throw, and it would
    // take the rest of the transport's tick with it.
    if (!this.kick || this.kick.disposed) return;
    const step = this.step % 16;
    if (step === 0) {
      this.bars++;
      if (this.bars % 8 === 0) this.rollPatterns();
    }
    this.step++;

    // Swing the offbeat sixteenths. A night pattern then takes its fixed
    // per-step offsets — the same hits land in the same wrong places every
    // bar, which is handmade rather than sloppy. Everything else gets a
    // little random jitter so no two hits sit exactly on the grid.
    const sixteenth = Tone.Time('16n').toSeconds();
    const swung = step % 2 === 1 ? this.swing * 0.3 * sixteenth : 0;
    const drift = this.nudges
      ? this.nudges[step]!
      : (Math.random() - 0.5) * JITTER_SPAN_SEC;
    const at = time + swung + drift;

    /**
     * Attack only, no release.
     *
     * Every drum here but the open hat is voiced with `sustain: 0`, so its
     * decay is the note and a release does nothing audible — scheduling one
     * had no musical job and one real consequence. The note values were
     * chosen without reference to how far away the next step lands, and the
     * gap is a good deal shorter than a sixteenth: swing pushes an offbeat
     * later while the step after it stays put, and the nudges pull hits
     * around by up to a nudge span more. When the note outlasted the gap, a
     * monophonic drum was asked to re-attack with its own stop still
     * scheduled ahead of it, and Web Audio threw — out in the transport's
     * tick, where nothing in the engine catches it and the rest of that
     * tick's events went with it.
     */

    const style = this.style();
    const fourFour = isFourFourStyle(style);
    const night = style !== 'open';
    const rootMidi = this.harmonicContext?.rootMidi ?? 45;

    // One octave under the root, not two. At two the fundamental landed at
    // 18-29Hz, under or barely at the bottom of hearing: no speaker outside
    // a cinema reproduces it, so it arrived as cone excursion rather than as
    // a note. An octave up is 37-58Hz — the range the deep-pressure sub
    // already works in, and a kick you can actually hear land.
    const kickPitch = Tone.Frequency(rootMidi - 12, 'midi').toFrequency();

    // A four-four kick never drops a beat. The probability that thins the
    // other kits would turn the floor into a stumble.
    if (euclideanHit(this.kickPattern, step, fourFour ? 1 : night ? 0.99 : 0.94)) {
      const vel = fourFour
        ? (style === 'techno' ? 0.82 : 0.78) + Math.random() * 0.07
        : // A 2-step kick is a thud placed just so, not a punch: softer and
          // more even than the open kit's, because the pattern carries it.
          night
          ? 0.6 + Math.random() * 0.08
          : 0.72 + Math.random() * 0.16;
      this.kick.triggerAttack(kickPitch, this.kickTime.atLeast(at), vel);
    }

    const openHit = this.openHatPattern[step] === true;
    const hatHit =
      !openHit && euclideanHit(this.hatPattern, step, fourFour ? 0.97 : night ? 0.92 : 0.8);

    // Any hat closes the open one, because they are the same physical hi-hat.
    // That choke is the difference between an offbeat open hat and a wash of
    // noise sitting over the bar, and it is most of why four-on-the-floor
    // breathes instead of droning.
    if ((openHit || hatHit) && this.openHatRinging) {
      this.openHat?.triggerRelease(this.openHatTime.atLeast(at));
      this.openHatRinging = false;
    }

    if (openHit) {
      this.openHat?.triggerAttack(
        this.openHatTime.atLeast(at),
        0.2 + Math.random() * 0.06,
      );
      this.openHatRinging = true;
    } else if (hatHit) {
      // House accents the offbeat under its open hats; techno accents the
      // downbeat, which is what makes the same sixteenths read as driving
      // rather than as shuffling.
      const onGrid = step % 4 === 0;
      const accent = fourFour
        ? (style === 'techno' ? onGrid : !onGrid)
          ? 0.24 + Math.random() * 0.05
          : 0.11 + Math.random() * 0.07
        : onGrid
          ? 0.28
          : 0.1 + Math.random() * 0.12;
      this.hat?.triggerAttack(this.hatTime.atLeast(at), accent);
    }

    if (this.clapPattern[step]) this.fireClap(at, style);

    if (euclideanHit(this.clickPattern, step, night ? 0.97 : 0.6)) {
      if (style === 'two-step') {
        // Backbeat on 2 and 4 holds flat against the lurching kick; the
        // off-grid extras are ghosts.
        const backbeat = step === 4 || step === 12;
        this.snare?.triggerAttack(
          this.snareTime.atLeast(at),
          backbeat ? 0.3 + Math.random() * 0.06 : 0.09 + Math.random() * 0.06,
        );
      } else {
        const pitch = Tone.Frequency(rootMidi + 12, 'midi').toFrequency();
        this.click?.triggerAttack(
          pitch,
          this.clickTime.atLeast(at + 0.004),
          (fourFour ? 0.12 : 0.18) + Math.random() * 0.08,
        );
      }
    }
  }

  /**
   * A clap is not one sound.
   *
   * It is three or four hands not quite together, and then the room they are
   * in. The bursts are what makes it read as people; the tail underneath is
   * what makes it read as a place. A single noise burst with a long decay —
   * the obvious first try — is a snare, and a snare on 2 and 4 over a
   * four-four kick is a rock beat.
   */
  private fireClap(at: number, style: KitStyle): void {
    const v = (style === 'techno' ? 0.26 : 0.3) + Math.random() * 0.05;
    const spread = style === 'techno' ? 0.008 : 0.011;
    this.clap?.triggerAttack(this.clapTime.atLeast(at), v);
    this.clap?.triggerAttack(this.clapTime.atLeast(at + spread), v * 0.78);
    this.clap?.triggerAttack(this.clapTime.atLeast(at + spread * 1.9), v * 0.62);
    this.clapTail?.triggerAttack(this.clapTailTime.atLeast(at + spread * 0.6), v * 0.55);
  }

  onUpdate(): void {
    // The world changed underneath a kit that never left. Rebuild rather than
    // exit: the trimmer protects this voice on a night piece precisely so the
    // groove cannot evaporate mid-movement, and exiting to get re-activated
    // would be the same evaporation by another route.
    const style = this.style();
    if (style !== this.builtStyle) {
      this.teardownKit();
      this.buildKit(style);
      this.step = 0;
      this.bars = 0;
      this.rollPatterns();
    }
  }

  onExit(): void {
    this.loop?.stop().dispose();
    this.loop = null;
    this.teardownKit();
  }
}

/**
 * Vinyl surface noise: a continuous hiss floor with sparse crackles riding
 * on top.
 *
 * The most recognisable thing about a Burial record after the drums, and
 * the reason his pads sound like they were found rather than played. It
 * runs for the whole of a night piece rather than being scheduled like
 * the other textures — surface noise that came and went would just read as
 * a synth part.
 *
 * The crackles are Poisson-ish rather than metrical: a low per-tick chance
 * of a click, so they never line up with the bar and never settle into a
 * rhythm of their own.
 */
export class VinylCrackle extends VoiceBase {
  private hiss: Tone.Noise | null = null;
  private hissFilter: Tone.Filter | null = null;
  private hissGain: Tone.Gain | null = null;
  private click: Tone.NoiseSynth | null = null;
  private clickFilter: Tone.Filter | null = null;
  private loop: Tone.Loop | null = null;

  constructor(dest: Bus) {
    super('vinylCrackle', dest, 0.26);
    this.fadeSpeed = 0.01;
  }

  onEnter(): void {
    this.clearPendingDispose();

    // Bandpassed pink noise: the bed. Rolled off top and bottom so it sits
    // as room rather than as air.
    this.hissGain = new Tone.Gain(0.16).connect(this.output);
    this.hissFilter = new Tone.Filter({ frequency: 2600, type: 'bandpass', Q: 0.4 })
      .connect(this.hissGain);
    this.hiss = new Tone.Noise('pink').connect(this.hissFilter);
    this.hiss.start();

    this.clickFilter = new Tone.Filter(3400, 'highpass', -12).connect(this.output);
    this.click = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.0005, decay: 0.006, sustain: 0 },
    }).connect(this.clickFilter);

    this.loop = new Tone.Loop((time) => this.tick(time), '32n').start('+0.05');
  }

  private tick(time: number): void {
    // Roughly a click every second or so, clustering naturally because each
    // tick rolls independently.
    if (Math.random() > 0.06) return;
    const soft = Math.random() < 0.7;
    this.click?.triggerAttackRelease(
      '128n',
      time + Math.random() * 0.01,
      soft ? 0.05 + Math.random() * 0.07 : 0.16 + Math.random() * 0.14,
    );
  }

  onUpdate(): void {}

  onExit(): void {
    this.loop?.stop().dispose();
    this.loop = null;
    this.hiss?.stop();
    this.scheduleDispose(
      [this.hiss, this.hissFilter, this.hissGain, this.click, this.clickFilter],
      0.6,
    );
    this.hiss = null;
    this.hissFilter = null;
    this.hissGain = null;
    this.click = null;
    this.clickFilter = null;
  }
}

/**
 * The set the neighbouring room plays. Deliberately small and all on one
 * bus: it is heard through a wall, so detail is wasted, and it has to cost
 * almost nothing on top of a full engine and a WebGL field. No HRTF
 * panners here for the same reason.
 */
export function createRoomVoices(bus: Bus): VoiceBase[] {
  return [
    new HarmonyBed(bus),
    new GlassPad(bus),
    new AirTexture(bus),
    new RoomTone(bus),
    new SlowArp(bus),
  ];
}

/** One step of a bassline: which scale degree, and in which octave. */
interface BassStep {
  degree: number;
  octave: number;
}

/**
 * How far the bass is pulled down on each kick, and how long it takes to come
 * back. Not a mixing trick bolted on afterwards — the pump *is* the genre's
 * sense of motion, the thing that makes a loop feel like it is going
 * somewhere. Techno ducks harder and recovers slower, so the bar breathes in
 * longer strokes.
 */
const SIDECHAIN: Record<'house' | 'techno', { floor: number; recoverSec: number }> = {
  house: { floor: 0.42, recoverSec: 0.17 },
  techno: { floor: 0.3, recoverSec: 0.24 },
};

/**
 * The line that plays in the gaps the kick leaves.
 *
 * A four-on-the-floor kit on its own is a metronome with opinions. What
 * turns it into music is a bass that answers it — and the reason a house
 * bassline lives on the offbeat is not decoration, it is that the kick has
 * already taken the beat and there is nowhere else to be. Chicago's bounces
 * between the root and the octave above and gets out of the way; Detroit's
 * stays lower and drives, more notes and less air, because at 130 with no
 * shuffle the bass is what is carrying the groove rather than riding it.
 *
 * Everything else here is scheduled to be beautiful. This is scheduled to
 * make you move, and it is the only voice in the orchestra that knows it.
 */
export class ClubBass extends VoiceBase {
  private synth: Tone.MonoSynth | null = null;
  /** Sidechain gain — the kick ducks this, see `SIDECHAIN`. */
  private duck: Tone.Gain | null = null;
  private loop: Tone.Loop | null = null;
  private pumpLoop: Tone.Loop | null = null;
  private readonly noteTime = new ScheduleTime();
  private pattern: (BassStep | null)[] = new Array(16).fill(null);
  private step = 0;
  private bars = 0;
  private builtGroove: 'house' | 'techno' = 'house';

  constructor(dest: Bus) {
    // Measured against the kit rather than guessed: at 0.34 the line sat
    // about 3.5dB over the kick, and in a four-four the kick is the floor —
    // anything above it is standing on the thing it is supposed to stand on.
    super('clubBass', dest, 0.24);
    this.fadeSpeed = 0.02;
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.build(clubGroove(ctx));
    this.step = 0;
    this.bars = 0;
    this.rollPattern();
    this.loop = new Tone.Loop((time) => this.tick(time), '16n').start('+0.1');
    // The pump runs on its own quarter-note loop rather than off the kit,
    // because both are locked to the same transport and a four-four kick is
    // on every quarter by definition. Reading it from the kit would couple
    // two voices to say something the grid already says.
    this.pumpLoop = new Tone.Loop((time) => this.pump(time), '4n').start('+0.1');
  }

  private build(groove: 'house' | 'techno'): void {
    this.duck = new Tone.Gain(1).connect(this.output);
    this.synth = new Tone.MonoSynth(
      groove === 'house'
        ? {
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.004, decay: 0.18, sustain: 0.22, release: 0.12 },
            filter: { type: 'lowpass', rolloff: -24, Q: 2.4 },
            filterEnvelope: {
              attack: 0.004,
              decay: 0.13,
              sustain: 0.12,
              release: 0.1,
              baseFrequency: 95,
              octaves: 2.7,
            },
          }
        : {
            oscillator: { type: 'sawtooth' },
            envelope: { attack: 0.005, decay: 0.22, sustain: 0.42, release: 0.14 },
            filter: { type: 'lowpass', rolloff: -24, Q: 4.2 },
            filterEnvelope: {
              attack: 0.006,
              decay: 0.19,
              sustain: 0.2,
              release: 0.12,
              baseFrequency: 78,
              octaves: 3.1,
            },
          },
    ).connect(this.duck);
    this.builtGroove = groove;
  }

  private teardown(): void {
    this.scheduleDispose([this.synth, this.duck], 0.5);
    this.synth = null;
    this.duck = null;
  }

  /**
   * The bar's worth of notes.
   *
   * House sits on the offbeat eighths — the "and" of every beat, which is
   * exactly where the kick isn't — and jumps the octave on some of them,
   * which is the whole bounce. Techno fills more of the grid and stays down
   * there; the syncopation carries it instead of the octave.
   */
  private rollPattern(): void {
    const house = this.builtGroove === 'house';
    const steps: number[] = house
      ? pickOne([
          [2, 6, 10, 14],
          [2, 6, 10, 14],
          [2, 6, 10, 13, 14],
          [2, 3, 6, 10, 14],
        ])
      : pickOne([
          [0, 3, 6, 8, 11, 14],
          [0, 6, 8, 11, 14],
          [0, 2, 3, 6, 8, 10, 11, 14],
          [0, 3, 8, 11],
        ]);

    // Which degrees the line walks. The root does most of the work — a
    // bassline that keeps moving harmonically stops being a floor — with the
    // fifth and the flat seventh as the places it goes and comes back from.
    const colour = pickOne([
      [0, 0, 0, 4],
      [0, 0, 4, 0],
      [0, 0, 0, 6],
      [0, 4, 0, 2],
    ]);

    this.pattern = new Array(16).fill(null);
    steps.forEach((st, i) => {
      const degree = colour[i % colour.length]!;
      // House jumps up for the answer; techno stays under the floor.
      const octave = house ? (i % 2 === 1 && Math.random() < 0.6 ? 1 : 0) : Math.random() < 0.3 ? -1 : 0;
      this.pattern[st] = { degree, octave };
    });
  }

  /** How many sixteenths until this line next speaks — a note must not outlast it. */
  private stepsUntilNext(from: number): number {
    for (let i = 1; i <= 16; i++) {
      if (this.pattern[(from + i) % 16]) return i;
    }
    return 16;
  }

  private tick(time: number): void {
    if (!this.synth || this.synth.disposed || !this.harmonicContext) return;
    const step = this.step % 16;
    if (step === 0) {
      this.bars++;
      if (this.bars % 4 === 0) this.rollPattern();
    }
    this.step++;

    const hit = this.pattern[step];
    if (!hit) return;

    const sixteenth = Tone.Time('16n').toSeconds();
    const note = this.noteAt(this.harmonicContext, hit.degree, hit.octave);
    // A mono synth re-attacked while it is still releasing steals its own
    // note. Fitting the length to the gap keeps every note short of the next.
    const dur = fitToStep(
      sixteenth * this.stepsUntilNext(step) * (this.builtGroove === 'house' ? 0.8 : 1),
      sixteenth * this.stepsUntilNext(step),
    );
    const vel = 0.62 + Math.random() * 0.12;
    this.synth.triggerAttackRelease(note, dur, this.noteTime.atLeast(time), vel);
  }

  /** Duck on the beat, recover before the next one. */
  private pump(time: number): void {
    const duck = this.duck;
    if (!duck || duck.disposed) return;
    const { floor, recoverSec } = SIDECHAIN[this.builtGroove];
    const g = duck.gain;
    g.cancelScheduledValues(time);
    g.setValueAtTime(floor, time);
    g.linearRampToValueAtTime(1, time + recoverSec);
  }

  onHarmonicShift(): void {
    this.rollPattern();
  }

  onUpdate(): void {
    const groove = this.harmonicContext ? clubGroove(this.harmonicContext) : this.builtGroove;
    if (groove !== this.builtGroove) {
      this.teardown();
      this.build(groove);
      this.rollPattern();
    }
  }

  onExit(): void {
    this.loop?.stop().dispose();
    this.pumpLoop?.stop().dispose();
    this.loop = null;
    this.pumpLoop = null;
    this.synth?.triggerRelease(this.noteTime.next());
    this.teardown();
  }
}

/**
 * The chord, hit rather than held.
 *
 * The rest of this orchestra states harmony by swelling into it over four
 * seconds. A stab states it in forty milliseconds and then gets out, and
 * that difference is most of what separates a record you sway to from one
 * you dance to. Chicago's is an organ on the offbeat, bright and a little
 * cheap and completely joyful; Detroit's is a string chord played by a
 * machine that wishes it were an orchestra, which is the sound of that city
 * in one gesture.
 */
export class ClubStab extends VoiceBase {
  private synth: Tone.PolySynth | null = null;
  private filter: Tone.Filter | null = null;
  private loop: Tone.Loop | null = null;
  private readonly stabTime = new ScheduleTime();
  private pattern: boolean[] = EMPTY_PATTERN;
  private step = 0;
  private bars = 0;
  private builtGroove: 'house' | 'techno' = 'house';

  constructor(dest: Bus) {
    super('clubStab', dest, 0.2);
    this.fadeSpeed = 0.018;
    this.respondsToEnsemble = true;
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.build(clubGroove(ctx));
    this.step = 0;
    this.bars = 0;
    this.rollPattern();
    this.loop = new Tone.Loop((time) => this.tick(time), '16n').start('+0.1');
  }

  private build(groove: 'house' | 'techno'): void {
    const house = groove === 'house';
    this.filter = new Tone.Filter(house ? 3200 : 2400, 'lowpass', -12).connect(this.output);
    this.synth = new Tone.PolySynth(
      Tone.Synth,
      house
        ? {
            // Drawbars: a square is the closest a single oscillator gets to
            // the organ every one of these records ran through.
            oscillator: { type: 'square4' },
            envelope: { attack: 0.006, decay: 0.3, sustain: 0.04, release: 0.4 },
          }
        : {
            oscillator: { type: 'fatsawtooth', spread: 24, count: 3 },
            envelope: { attack: 0.012, decay: 0.5, sustain: 0.08, release: 0.7 },
          },
    ).connect(this.filter);
    this.synth.maxPolyphony = 8;
    this.builtGroove = groove;
  }

  private teardown(): void {
    this.releaseAndDispose(this.synth, 1.2, this.filter);
    this.synth = null;
    this.filter = null;
  }

  private rollPattern(): void {
    this.pattern = stepsToPattern(
      this.builtGroove === 'house'
        ? pickOne([
            [2, 10],
            [6, 14],
            [2, 6, 10, 14],
            [3, 11],
            [2, 10, 14],
          ])
        : pickOne([
            [6, 14],
            [14],
            [3, 11],
            [6, 10, 14],
          ]),
    );
  }

  private tick(time: number): void {
    if (!this.synth || this.synth.disposed || !this.harmonicContext) return;
    const step = this.step % 16;
    if (step === 0) {
      this.bars++;
      // Stabs come and go across the bar rather than repeating for the whole
      // piece — a hook you hear every bar for ten minutes stops being a hook.
      if (this.bars % 4 === 0) this.rollPattern();
    }
    this.step++;
    if (!this.pattern[step]) return;

    const ctx = this.harmonicContext;
    const sixteenth = Tone.Time('16n').toSeconds();
    const notes = ctx.chordDegrees.map((d) => this.noteAt(ctx, d, this.builtGroove === 'house' ? 1 : 0));
    this.synth.triggerAttackRelease(
      notes,
      sixteenth * (this.builtGroove === 'house' ? 0.9 : 1.6),
      this.stabTime.atLeast(time),
      0.14 + Math.random() * 0.05,
    );
  }

  onHarmonicShift(): void {
    this.rollPattern();
  }

  onUpdate(): void {
    const groove = this.harmonicContext ? clubGroove(this.harmonicContext) : this.builtGroove;
    if (groove !== this.builtGroove) {
      this.teardown();
      this.build(groove);
      this.rollPattern();
    }
  }

  onExit(): void {
    this.loop?.stop().dispose();
    this.loop = null;
    this.teardown();
  }
}

/** Which four-four groove is running. Falls back to house off a night piece,
 * which only matters for the instant between activation and the first tick. */
function clubGroove(ctx: HarmonicContext): 'house' | 'techno' {
  return ctx.character === 'night' && ctx.nightGroove === 'techno' ? 'techno' : 'house';
}

export function createAllVoices(
  padBus: Bus,
  melodyBus: Bus,
  airBus: Bus,
  subBus: Bus,
  foundationBus: Bus = padBus,
  pulseBus: Bus = padBus,
  bassBus: Bus = padBus,
): VoiceBase[] {
  return [
    new OrchestraWhole(padBus),
    new HarmonyBed(padBus),
    new DreamMelody(melodyBus),
    new SubDrone(foundationBus),
    new DeepPressure(subBus),
    new WarmPad(padBus),
    new GlassPad(melodyBus),
    new AirTexture(airBus),
    new DistantBell(melodyBus),
    new TapeChoir(melodyBus),
    new ModalStrings(padBus),
    new CrystalCluster(melodyBus),
    new RoomTone(airBus),
    new SlowArp(melodyBus),
    new HarmonicGhost(melodyBus),
    new FieldRecording(airBus),
    new MelodicFlurry(melodyBus),
    new SparkRun(melodyBus),
    new RhythmicPulse(padBus),
    new PulseKit(pulseBus),
    new ClubBass(bassBus),
    new ClubStab(melodyBus),
    new VinylCrackle(airBus),
    new GranularTexture(airBus),
    ...createClipVoices(padBus, melodyBus, airBus),
  ];
}
