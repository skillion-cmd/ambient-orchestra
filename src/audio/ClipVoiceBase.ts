import * as Tone from 'tone';
import type { HarmonicContext, SoundKnobs } from './types';
import { VoiceBase } from './VoiceBase';

/** Looping clip voice — plays like a sample for a stretch, then fades out */
export abstract class ClipVoiceBase extends VoiceBase {
  protected elapsed = 0;
  protected clipDuration = 35;
  protected loop: Tone.Loop | null = null;
  protected loopInterval = '2n';

  constructor(id: string, dest: Tone.ToneAudioNode, maxGain = 0.18) {
    super(id, dest, maxGain);
    this.fadeSpeed = 0.01;
  }

  protected abstract startLoop(ctx: HarmonicContext): void;

  onEnter(ctx: HarmonicContext): void {
    this.clearPendingDispose();
    this.elapsed = 0;
    this.clipDuration = 28 + Math.random() * 45;
    this.startLoop(ctx);
  }

  onUpdate(dt: number, _interest: number, _knobs: SoundKnobs): void {
    this.elapsed += dt;
    if (this.elapsed >= this.clipDuration - 4) {
      this.targetLevel = Math.max(0, this.maxGain * ((this.clipDuration - this.elapsed) / 4));
    }
    if (this.elapsed >= this.clipDuration) {
      this.exit();
    }
  }

  protected stopLoop(): void {
    this.loop?.stop(0);
    this.loop?.dispose();
    this.loop = null;
  }

  onExit(): void {
    this.stopLoop();
  }
}
