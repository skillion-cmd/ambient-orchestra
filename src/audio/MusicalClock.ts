import * as Tone from 'tone';
import type { MovementPhase, SoundKnobs } from './types';

export class MusicalClock {
  private lastBar = -1;
  private lastBeatInt = -1;
  private lastTargetBpm = 58;

  beatInBar = 0;
  currentBar = 0;
  subdivision = 0;
  beatPulse = 0;

  init(): void {
    Tone.getTransport().bpm.value = 58;
    Tone.getTransport().timeSignature = [4, 4];
  }

  update(_dt: number, phase: MovementPhase, knobs: SoundKnobs): void {
    const pulseKnob = knobs.pulse ?? 0.5;
    const targetBpm = this.bpmForPhase(phase, pulseKnob);
    if (Math.abs(targetBpm - this.lastTargetBpm) > 0.25) {
      Tone.getTransport().bpm.rampTo(targetBpm, 2);
      this.lastTargetBpm = targetBpm;
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

  private bpmForPhase(phase: MovementPhase, pulse: number): number {
    const base = 52 + pulse * 20;
    switch (phase) {
      case 'drift':
        return base - 4;
      case 'gather':
        return base;
      case 'bloom':
        return base + 6;
      case 'hang':
        return base + 2;
      case 'dissolve':
        return base - 2;
      case 'exhale':
        return base - 6;
      default:
        return base;
    }
  }
}
