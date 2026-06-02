import * as Tone from 'tone';
import type { HarmonicContext } from '../types';
import { euclidean, euclideanHit } from '../Euclidean';
import { ClipVoiceBase } from '../ClipVoiceBase';

type Bus = Tone.ToneAudioNode;

/** Slow hymn-like chord loop — feels like a sampled choir bed */
export class HymnClip extends ClipVoiceBase {
  private synth: Tone.PolySynth | null = null;

  constructor(dest: Bus) {
    super('hymnClip', dest, 0.17);
    this.loopInterval = '1m';
  }

  protected startLoop(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsine', spread: 10, count: 2 },
      envelope: { attack: 1.2, decay: 0.8, sustain: 0.5, release: 2.5 },
    }).connect(this.output);
    this.synth.maxPolyphony = 6;

    const play = () => {
      if (!this.synth || !this.harmonicContext) return;
      const notes = this.getChordNotes(this.harmonicContext, 0);
      this.synth.triggerAttackRelease(notes, '2n', Tone.now(), 0.2);
    };

    play();
    this.loop = new Tone.Loop(play, this.loopInterval);
    this.loop.start(0);
  }

  onExit(): void {
    this.stopLoop();
    const synth = this.synth;
    this.releaseAndDispose(synth, 3);
    this.synth = null;
  }
}

/** Gentle arpeggio clip — euclidean picked pattern */
export class ArpClip extends ClipVoiceBase {
  private synth: Tone.Synth | null = null;
  private step = 0;
  private pattern: boolean[] = [];

  constructor(dest: Bus) {
    super('arpClip', dest, 0.14);
    this.loopInterval = '4n.';
  }

  protected startLoop(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.synth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.05, decay: 0.4, sustain: 0.15, release: 1.2 },
    }).connect(this.output);
    this.step = 0;
    this.pattern = euclidean(5, 16, ctx.currentBar % 16);

    const chordPattern = [...ctx.chordDegrees, ...ctx.chordDegrees.slice().reverse()];

    this.loop = new Tone.Loop(() => {
      if (!this.synth || !this.harmonicContext) return;
      const c = this.harmonicContext;
      if (!euclideanHit(this.pattern, this.step, 0.82)) {
        this.step++;
        return;
      }
      const deg = chordPattern[this.step % chordPattern.length] ?? 0;
      const note = this.noteAt(c, deg, 1);
      this.synth.triggerAttackRelease(note, '8n', Tone.now(), 0.13);
      this.step++;
    }, this.loopInterval);
    this.loop.start(0);
  }

  onExit(): void {
    this.stopLoop();
    const synth = this.synth;
    synth?.triggerRelease?.();
    this.scheduleDispose([synth], 1.5);
    this.synth = null;
  }
}

/** Melodic phrase clip — hook synced to bar */
export class PhraseClip extends ClipVoiceBase {
  private synth: Tone.PolySynth | null = null;
  private step = 0;

  constructor(dest: Bus) {
    super('phraseClip', dest, 0.15);
    this.loopInterval = '2n.';
  }

  protected startLoop(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsine', spread: 8, count: 2 },
      envelope: { attack: 0.25, decay: 0.5, sustain: 0.28, release: 1.8 },
    }).connect(this.output);
    this.synth.maxPolyphony = 4;
    this.step = 0;

    this.loop = new Tone.Loop(() => {
      if (!this.synth || !this.harmonicContext) return;
      const c = this.harmonicContext;
      const deg = c.melodyDegrees[this.step % c.melodyDegrees.length] ?? 0;
      const note = this.noteAt(c, deg, 1);
      const vel = c.melodyAccentPattern[this.step % c.melodyAccentPattern.length]
        ? 0.16
        : 0.11;
      this.synth.triggerAttackRelease(note, '4n', Tone.now(), vel);
      this.step++;
    }, this.loopInterval);
    this.loop.start(0);
  }

  onExit(): void {
    this.stopLoop();
    const synth = this.synth;
    this.releaseAndDispose(synth, 2);
    this.synth = null;
  }
}

/** Filtered texture clip — looped noise wash */
export class TextureClip extends ClipVoiceBase {
  private noise: Tone.Noise | null = null;
  private filter: Tone.Filter | null = null;
  private lfo: Tone.LFO | null = null;

  constructor(dest: Bus) {
    super('textureClip', dest, 0.1);
    this.loopInterval = '1m';
  }

  protected startLoop(_ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.filter = new Tone.Filter(1200, 'bandpass').connect(this.output);
    this.noise = new Tone.Noise('pink').connect(this.filter).start();
    this.lfo = new Tone.LFO(0.03, 600, 2200).connect(this.filter.frequency).start();

    this.loop = new Tone.Loop(() => {
      this.filter?.frequency.rampTo(700 + Math.random() * 1600, 4);
    }, this.loopInterval);
    this.loop.start(0);
  }

  onExit(): void {
    this.stopLoop();
    this.clearPendingDispose();
    this.noise?.stop().dispose();
    this.lfo?.stop().dispose();
    this.filter?.dispose();
    this.noise = null;
    this.lfo = null;
    this.filter = null;
  }
}

/** Long pad swell clip — breathes in and out on a loop */
export class WashClip extends ClipVoiceBase {
  private synth: Tone.PolySynth | null = null;
  private swellUp = true;

  constructor(dest: Bus) {
    super('washClip', dest, 0.16);
    this.loopInterval = '2m';
    this.clipDuration = 40 + Math.random() * 35;
  }

  protected startLoop(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsine', spread: 12, count: 3 },
      envelope: { attack: 3, decay: 1, sustain: 0.7, release: 4 },
    }).connect(this.output);
    this.synth.maxPolyphony = 6;

    const notes = this.getChordNotes(ctx, 0);
    this.synth.triggerAttack(notes, Tone.now(), 0.01);

    this.loop = new Tone.Loop(() => {
      if (!this.synth) return;
      const level = this.swellUp ? 0.24 : 0.1;
      this.synth.volume.rampTo(Tone.gainToDb(level), 6);
      this.swellUp = !this.swellUp;
    }, this.loopInterval);
    this.loop.start(0);
  }

  onExit(): void {
    this.stopLoop();
    const synth = this.synth;
    this.releaseAndDispose(synth, 5);
    this.synth = null;
  }
}

export function createClipVoices(
  padBus: Bus,
  melodyBus: Bus,
  airBus: Bus,
): ClipVoiceBase[] {
  return [
    new HymnClip(padBus),
    new ArpClip(melodyBus),
    new PhraseClip(melodyBus),
    new TextureClip(airBus),
    new WashClip(padBus),
  ];
}
