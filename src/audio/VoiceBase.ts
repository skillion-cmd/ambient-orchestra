import * as Tone from 'tone';
import { chordNotes, currentMelodyNote, noteFromDegree } from './HarmonicField';
import type { HarmonicContext, SoundKnobs, VoiceState } from './types';

const VOICE_PANS: Record<string, number> = {
  orchestraWhole: 0,
  harmonyBed: 0,
  warmPad: -0.38,
  modalStrings: 0.42,
  subDrone: 0,
  dreamMelody: -0.22,
  tapeChoir: 0.28,
  glassPad: 0.55,
  slowArp: -0.45,
  crystalCluster: 0.35,
  distantBell: -0.6,
  harmonicGhost: 0.18,
  melodicFlurry: 0.12,
  sparkRun: -0.15,
  airTexture: -0.7,
  roomTone: 0,
  hymnClip: 0.1,
  arpClip: -0.2,
  phraseClip: 0.15,
  textureClip: -0.55,
  washClip: 0.05,
  fieldRecording: 0.65,
  rhythmicPulse: 0,
  granularTexture: 0,
};

export abstract class VoiceBase {
  protected state: VoiceState = 'dormant';
  protected level = 0;
  protected targetLevel = 0;
  protected readonly output: Tone.Gain;
  /** Stereo panner OR HRTF 3D panner, depending on `spatial`. */
  private readonly panNode: Tone.Panner | Tone.Panner3D;
  private readonly spatial: boolean;
  private readonly basePan: number;
  protected harmonicContext: HarmonicContext | null = null;
  protected fadeSpeed = 0.012;
  protected lastMovementIndex = -1;
  protected lastGestureId = -1;
  /** Voices that swell together on ensemble cues */
  protected respondsToEnsemble = false;
  private disposeTimeouts: ReturnType<typeof setTimeout>[] = [];
  /** Nodes awaiting deferred dispose — torn down immediately on re-enter */
  private pendingDisposeNodes: Tone.ToneAudioNode[] = [];
  private lastOutputLevel = -1;
  private lastFilterFreq = -1;

  constructor(
    readonly id: string,
    destination: Tone.ToneAudioNode,
    protected readonly maxGain = 0.35,
    pan?: number,
    spatial = false,
  ) {
    const panValue = pan ?? VOICE_PANS[id] ?? (Math.random() * 0.8 - 0.4);
    this.basePan = panValue;

    // HRTF binaural positioning for select voices; gracefully fall back to a
    // stereo panner if Panner3D is unavailable. rolloffFactor 0 keeps the
    // directional cue without distance volume loss.
    let node: Tone.Panner | Tone.Panner3D | null = null;
    if (spatial) {
      try {
        node = new Tone.Panner3D({
          panningModel: 'HRTF',
          positionX: panValue * 3,
          positionY: 0,
          positionZ: -2,
          rolloffFactor: 0,
        });
      } catch {
        node = null;
      }
    }
    this.spatial = node != null;
    this.panNode = (node ?? new Tone.Panner(panValue)).connect(destination) as
      | Tone.Panner
      | Tone.Panner3D;
    this.output = new Tone.Gain(0).connect(this.panNode);
  }

  /** Collapse toward mono (0) or spread wide (1.5). Ramped to avoid clicks. */
  setStereoWidth(width: number, rampSec = 2): void {
    if (this.spatial) {
      const node = this.panNode as Tone.Panner3D;
      node.positionX.rampTo(this.basePan * 3 * width, rampSec);
    } else {
      const node = this.panNode as Tone.Panner;
      node.pan.rampTo(Math.max(-1, Math.min(1, this.basePan * width)), rampSec);
    }
  }

  abstract onEnter(ctx: HarmonicContext): void;
  abstract onUpdate(dt: number, interest: number, knobs: SoundKnobs): void;
  abstract onExit(): void;

  onHarmonicShift(_ctx: HarmonicContext): void {}

  /** Group breath — re-articulate with the ensemble */
  onEnsembleCue(_ctx: HarmonicContext): void {}

  enter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.harmonicContext = ctx;
    this.lastMovementIndex = ctx.movementIndex;
    this.lastGestureId = ctx.gestureId;
    this.state = 'fadingIn';
    this.targetLevel = this.maxGain;
    this.lastFilterFreq = -1;
    this.onEnter(ctx);
  }

  update(dt: number, interest: number, knobs: SoundKnobs): void {
    if (this.state === 'dormant') return;

    const phaseBoost = phaseLevelBoost(this.harmonicContext?.movementPhase);
    const interestBoost = 0.8 + interest * 0.2;
    const ensembleBoost =
      1 + (this.harmonicContext?.ensemblePulse ?? 0) * (this.respondsToEnsemble ? 0.12 : 0.04);
    const warmthCutoff = 800 + knobs.warmth * 1200;

    this.onUpdate(dt, interest, knobs);

    const target = this.targetLevel * interestBoost * phaseBoost * ensembleBoost;

    if (this.state === 'fadingIn') {
      this.level += this.fadeSpeed * dt * 60;
      if (this.level >= target) {
        this.level = target;
        this.state = 'sustaining';
      }
    } else if (this.state === 'sustaining') {
      this.level += (target - this.level) * 0.025 * dt * 60;
      if (Math.random() < 0.0002 * dt * 60) {
        this.state = 'morphing';
      }
    } else if (this.state === 'morphing') {
      if (Math.random() < 0.0015 * dt * 60) {
        this.state = 'sustaining';
      }
    } else if (this.state === 'fadingOut') {
      this.level -= this.fadeSpeed * 0.6 * dt * 60;
      if (this.level <= 0.001) {
        this.level = 0;
        this.state = 'dormant';
        this.onExit();
      }
    }

    const outLevel = Math.max(0, this.level);
    if (Math.abs(outLevel - this.lastOutputLevel) > 0.006) {
      this.output.gain.rampTo(outLevel, 0.15);
      this.lastOutputLevel = outLevel;
    }
    this.applyWarmth(warmthCutoff);
  }

  syncContext(ctx: HarmonicContext): void {
    this.harmonicContext = ctx;
    if (this.state === 'fadingOut') return;

    const movementChanged = ctx.movementIndex !== this.lastMovementIndex;
    if (movementChanged) {
      this.onHarmonicShift(ctx);
      this.lastMovementIndex = ctx.movementIndex;
    }
    if (
      this.respondsToEnsemble &&
      ctx.gestureId !== this.lastGestureId &&
      ctx.ensemblePulse > 0.4
    ) {
      this.onEnsembleCue(ctx);
      this.lastGestureId = ctx.gestureId;
    }
  }

  exit(): void {
    if (this.state === 'dormant' || this.state === 'fadingOut') return;
    this.state = 'fadingOut';
    this.targetLevel = 0;
  }

  getLevel(): number {
    return this.level;
  }

  getState(): VoiceState {
    return this.state;
  }

  isActive(): boolean {
    return this.state !== 'dormant';
  }

  protected applyWarmth(_cutoff: number): void {}

  /** Avoid scheduling filter automation every frame */
  protected rampFilter(filter: Tone.Filter | null, freq: number, time = 2): void {
    if (!filter) return;
    if (Math.abs(freq - this.lastFilterFreq) < 20) return;
    filter.frequency.rampTo(freq, time);
    this.lastFilterFreq = freq;
  }

  protected freqFromDegree(degree: number, ctx: HarmonicContext, octave = 0): number {
    const idx = ((degree % ctx.scale.length) + ctx.scale.length) % ctx.scale.length;
    const semitones = ctx.scale[idx]! + octave * 12;
    return Tone.Frequency(ctx.rootMidi + semitones, 'midi').toFrequency();
  }

  protected pickDegree(ctx: HarmonicContext): number {
    return Math.floor(Math.random() * ctx.scale.length);
  }

  protected getChordNotes(ctx: HarmonicContext, octave = 0): string[] {
    return chordNotes(ctx, octave);
  }

  protected getMelodyNote(ctx: HarmonicContext, octave = 1): string {
    return currentMelodyNote(ctx, octave);
  }

  protected noteAt(ctx: HarmonicContext, degree: number, octave = 0): string {
    return noteFromDegree(ctx, degree, octave);
  }

  /** Cancel pending dispose timers and immediately tear down orphaned nodes */
  protected clearPendingDispose(): void {
    for (const id of this.disposeTimeouts) clearTimeout(id);
    this.disposeTimeouts = [];
    for (const node of this.pendingDisposeNodes) {
      this.disposeNode(node);
    }
    this.pendingDisposeNodes = [];
  }

  /** Schedule node disposal after release tail — captures refs in closure */
  protected scheduleDispose(
    nodes: (Tone.ToneAudioNode | null | undefined)[],
    delaySec: number,
  ): void {
    const captured = nodes.filter((n): n is Tone.ToneAudioNode => n != null);
    if (captured.length === 0) return;
    this.pendingDisposeNodes.push(...captured);

    const id = setTimeout(() => {
      for (const node of captured) {
        this.disposeNode(node);
      }
      this.disposeTimeouts = this.disposeTimeouts.filter((t) => t !== id);
    }, delaySec * 1000);
    this.disposeTimeouts.push(id);
  }

  /** Release poly synth voices then dispose after delay */
  protected releaseAndDispose(
    synth: { releaseAll?: () => void } | null,
    delaySec: number,
    ...extras: (Tone.ToneAudioNode | null | undefined)[]
  ): void {
    synth?.releaseAll?.();
    this.scheduleDispose([synth as unknown as Tone.ToneAudioNode, ...extras], delaySec);
  }

  /** Re-articulate poly synth without stacking voices — prevents polyphony blowout */
  protected ensembleAttack(
    synth: Tone.PolySynth | null,
    notes: string[],
    velocity: number,
  ): void {
    if (!synth) return;
    synth.releaseAll();
    synth.triggerAttack(notes, Tone.now(), velocity);
  }

  private disposeNode(node: Tone.ToneAudioNode): void {
    this.pendingDisposeNodes = this.pendingDisposeNodes.filter((n) => n !== node);
    try {
      const releasable = node as { releaseAll?: () => void };
      releasable.releaseAll?.();
      node.dispose();
    } catch {
      /* already disposed */
    }
  }
}

function phaseLevelBoost(phase: HarmonicContext['movementPhase'] | undefined): number {
  switch (phase) {
    case 'drift':
      return 0.75;
    case 'gather':
      return 0.88;
    case 'bloom':
      return 1;
    case 'hang':
      return 0.95;
    case 'dissolve':
      return 0.75;
    case 'exhale':
      return 0.55;
    default:
      return 1;
  }
}
