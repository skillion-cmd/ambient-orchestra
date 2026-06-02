import * as Tone from 'tone';
import { createClipVoices } from '../clips';
import { isMelodyAccent } from '../HarmonicField';
import type { HarmonicContext, SoundKnobs } from '../types';
import { euclideanHit } from '../Euclidean';
import { VoiceBase } from '../VoiceBase';

type Bus = Tone.ToneAudioNode;

/** Rich stacked chord bed — the harmonic foundation */
export class HarmonyBed extends VoiceBase {
  private synth: Tone.PolySynth | null = null;
  private filter: Tone.Filter | null = null;

  constructor(dest: Bus) {
    super('harmonyBed', dest, 0.24);
    this.fadeSpeed = 0.008;
    this.respondsToEnsemble = true;
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.filter = new Tone.Filter(1100, 'lowpass').connect(this.output);
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsine', spread: 14, count: 3 },
      envelope: { attack: 5, decay: 3, sustain: 0.75, release: 18 },
    }).connect(this.filter);
    this.synth.maxPolyphony = 8;
    const notes = [
      ...this.getChordNotes(ctx, 0),
      ...this.getChordNotes(ctx, 1),
    ];
    this.synth.triggerAttack(notes, Tone.now(), 0.22);
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    if (!this.synth) return;
    const notes = [
      ...this.getChordNotes(ctx, 0),
      ...this.getChordNotes(ctx, 1),
    ];
    this.synth.releaseAll();
    this.synth.triggerAttack(notes, Tone.now() + 0.5, 0.18);
  }

  onEnsembleCue(ctx: HarmonicContext): void {
    this.ensembleAttack(this.synth, this.getChordNotes(ctx, 1), 0.1);
  }

  onUpdate(_dt: number, _interest: number, knobs: SoundKnobs): void {
    this.rampFilter(this.filter, 600 + knobs.warmth * 1400, 3);
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
    this.synth.triggerAttackRelease(note, '2n', Tone.now(), 0.12);
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
      this.synth.triggerAttackRelease(counterNote, '2n', Tone.now(), 0.07);
    }
  }

  private playMelodyNote(ctx: HarmonicContext): void {
    if (!this.synth) return;
    this.synth.triggerRelease();
    const note = this.getMelodyNote(ctx, 1);
    const accented = isMelodyAccent(ctx, this.accentStep);
    this.accentStep++;
    const vel = accented ? 0.22 + ctx.brightness * 0.08 : 0.14;
    this.synth.triggerAttack(note, Tone.now(), vel);
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

export class WarmPad extends VoiceBase {
  private synth: Tone.PolySynth | null = null;
  private filter: Tone.Filter | null = null;

  constructor(dest: Bus) {
    super('warmPad', dest, 0.2);
    this.respondsToEnsemble = true;
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.filter = new Tone.Filter(900, 'lowpass').connect(this.output);
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsine', spread: 20, count: 4 },
      envelope: { attack: 3.5, decay: 2, sustain: 0.72, release: 14 },
    }).connect(this.filter);
    this.synth.maxPolyphony = 6;
    const notes = this.getChordNotes(ctx, 0);
    this.synth.triggerAttack(notes, Tone.now(), 0.26);
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    if (!this.synth) return;
    this.synth.releaseAll();
    this.synth.triggerAttack(this.getChordNotes(ctx, 0), Tone.now() + 1, 0.2);
  }

  onEnsembleCue(ctx: HarmonicContext): void {
    this.ensembleAttack(this.synth, this.getChordNotes(ctx, 0), 0.14);
  }

  onUpdate(_dt: number, _interest: number, knobs: SoundKnobs): void {
    this.rampFilter(this.filter, 550 + knobs.warmth * 1000, 2);
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
    this.synth.triggerAttack(notes, Tone.now(), 0.16);
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    if (!this.synth) return;
    this.synth.releaseAll();
    const notes = ctx.chordDegrees.map((d) => this.noteAt(ctx, d, 2));
    this.synth.triggerAttack(notes, Tone.now() + 0.8, 0.14);
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
    this.synth.triggerAttackRelease(note, '2n', Tone.now(), 0.16);
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
  private synth: Tone.PolySynth | null = null;
  private wobblePhase = 0;
  private lastDetune = 0;

  constructor(dest: Bus) {
    super('tapeChoir', dest, 0.17);
    this.respondsToEnsemble = true;
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsine', spread: 16, count: 3 },
      envelope: { attack: 4, decay: 2, sustain: 0.65, release: 16 },
    }).connect(this.output);
    this.synth.maxPolyphony = 6;
    const notes = [
      ...ctx.chordDegrees.slice(0, 3).map((d) => this.noteAt(ctx, d, 0)),
      this.getMelodyNote(ctx, 1),
    ];
    this.synth.triggerAttack(notes, Tone.now(), 0.22);
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    if (!this.synth) return;
    this.synth.releaseAll();
    const notes = [
      ...ctx.chordDegrees.slice(0, 3).map((d) => this.noteAt(ctx, d, 0)),
      this.getMelodyNote(ctx, 1),
    ];
    this.synth.triggerAttack(notes, Tone.now() + 1.2, 0.18);
  }

  onEnsembleCue(ctx: HarmonicContext): void {
    const notes = ctx.chordDegrees.slice(0, 2).map((d) => this.noteAt(ctx, d, 0));
    this.ensembleAttack(this.synth, notes, 0.11);
  }

  onUpdate(dt: number, _interest: number, knobs: SoundKnobs): void {
    if (!this.synth) return;
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
    this.releaseAndDispose(synth, 16);
    this.synth = null;
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
    this.synth.triggerAttack(notes, Tone.now(), 0.2);
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    if (!this.synth) return;
    this.synth.releaseAll();
    this.synth.triggerAttack(this.getChordNotes(ctx, 0), Tone.now() + 0.6, 0.16);
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
    this.synth.triggerAttack(notes, Tone.now(), 0.1 + ctx.brightness * 0.06);
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    if (!this.synth) return;
    this.synth.releaseAll();
    const hookLen = Math.min(4, ctx.melodyDegrees.length);
    const notes = ctx.melodyDegrees.slice(0, hookLen).map((d) => this.noteAt(ctx, d, 2));
    this.synth.triggerAttack(notes, Tone.now() + 0.5, 0.08);
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
    this.synth?.triggerAttackRelease(note, '4n', Tone.now(), 0.13);
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
    this.synth.triggerAttack(notes, Tone.now(), 0.14);
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    if (!this.synth) return;
    this.synth.releaseAll();
    const notes = ctx.chordDegrees.slice(0, 2).map((d) => this.noteAt(ctx, d, 1));
    this.synth.triggerAttack(notes, Tone.now() + 0.7, 0.12);
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
  private synth: Tone.PolySynth | null = null;
  private filter: Tone.Filter | null = null;

  constructor(dest: Bus) {
    super('orchestraWhole', dest, 0.2);
    this.fadeSpeed = 0.007;
    this.respondsToEnsemble = true;
  }

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.filter = new Tone.Filter(1300, 'lowpass').connect(this.output);
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsine', spread: 22, count: 4 },
      envelope: { attack: 5, decay: 2, sustain: 0.8, release: 20 },
    }).connect(this.filter);
    this.synth.maxPolyphony = 10;
    const notes = [
      ...this.getChordNotes(ctx, -1),
      ...this.getChordNotes(ctx, 0),
      ...this.getChordNotes(ctx, 1),
    ];
    this.synth.triggerAttack(notes, Tone.now(), 0.2);
  }

  onHarmonicShift(ctx: HarmonicContext): void {
    if (!this.synth) return;
    this.synth.releaseAll();
    const notes = [
      ...this.getChordNotes(ctx, 0),
      ...this.getChordNotes(ctx, 1),
    ];
    this.synth.triggerAttack(notes, Tone.now() + 2, 0.16);
  }

  onEnsembleCue(ctx: HarmonicContext): void {
    const notes = [...this.getChordNotes(ctx, 0), this.getMelodyNote(ctx, 1)];
    this.ensembleAttack(this.synth, notes, 0.15);
  }

  onUpdate(_dt: number, _interest: number, knobs: SoundKnobs): void {
    this.rampFilter(this.filter, 700 + knobs.warmth * 1600, 3);
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
    this.playStep(ctx);
  }

  onUpdate(dt: number): void {
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
    this.synth?.triggerAttackRelease(note, '16n', Tone.now(), 0.14);
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
    this.playStep(ctx);
  }

  onUpdate(dt: number): void {
    if (this.state === 'fadingOut') {
      this.done = true;
      return;
    }
    if (!this.synth || !this.harmonicContext || this.done) return;
    this.timer += dt;
    if (this.timer >= 0.06) {
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
    this.synth?.triggerAttackRelease(note, '32n', Tone.now(), 0.11);
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
    this.body = new Tone.MembraneSynth({
      pitchDecay: 0.04,
      octaves: 2,
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
    this.barCount++;
    if (this.barCount < this.nextGap) return;
    this.barCount = 0;
    this.nextGap = 2 + Math.floor(Math.random() * 3);
    const root = this.harmonicContext
      ? Tone.Frequency(this.harmonicContext.rootMidi - 24, 'midi').toFrequency()
      : 45;
    this.body?.triggerAttackRelease(root, '16n', time, 0.9);
    this.clickNoise?.triggerAttackRelease('32n', time + 0.005, 0.25);
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

export function createAllVoices(
  padBus: Bus,
  melodyBus: Bus,
  airBus: Bus,
): VoiceBase[] {
  return [
    new OrchestraWhole(padBus),
    new HarmonyBed(padBus),
    new DreamMelody(melodyBus),
    new SubDrone(padBus),
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
    new GranularTexture(airBus),
    ...createClipVoices(padBus, melodyBus, airBus),
  ];
}
