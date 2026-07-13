import * as Tone from 'tone';
import { euclidean } from './Euclidean';
import {
  generatePhrase,
  melodyDurationBeats,
  pickInitialChord,
  pickNextChord,
  pickPhraseType,
} from './MusicTheory';
import { Movement, pickMovementVariant } from './Movement';
import type {
  ChordFunction,
  HarmonicContext,
  MelodyPhraseType,
  MovementPhase,
  SoundKnobs,
} from './types';
import {
  MODE_NEIGHBORS,
  MODE_SCALES,
  MODE_WEIGHTS,
} from './types';
import type { MusicalClock } from './MusicalClock';

const ROOTS = ['D', 'E', 'F', 'G', 'A', 'Bb'] as const;
const ROOT_MIDI: Record<(typeof ROOTS)[number], number> = {
  D: 38,
  E: 40,
  F: 41,
  G: 43,
  A: 45,
  Bb: 46,
};

const ROOT_WEIGHTS: Record<(typeof ROOTS)[number], number> = {
  D: 1.1,
  E: 1.2,
  F: 0.9,
  G: 1.25,
  A: 1.15,
  Bb: 0.85,
};

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

export class HarmonicField {
  private root: (typeof ROOTS)[number] = 'G';
  private mode = 'lydian';
  private chordDegrees: number[] = [0, 2, 4];
  private chordFunction: ChordFunction = 'tonic';
  private brightness = 0.8;
  private melodyDegrees: number[] = [];
  private melodyPhraseType: MelodyPhraseType = 'hook';
  private melodyNoteDurationBeats = 2;
  private melodyAccentPattern: boolean[] = euclidean(3, 8);
  private melodyIndex = 0;
  private melodyTimer = 0;
  private phraseMemoryId = 0;
  private storedHook: number[] | null = null;
  evolutionPhase = 0;

  private movement = new Movement(0);
  private transitioning = false;
  private transitionT = 0;
  private pendingRoot: (typeof ROOTS)[number] | null = null;
  private pendingMode: string | null = null;
  private pendingChord: number[] | null = null;
  private pendingChordFn: ChordFunction | null = null;
  private pendingBrightness = 0.8;
  private euclideanRotation = 0;
  private accentStep = 0;
  private pendingTransitionBloom = false;
  private pendingPhraseCadence: MelodyPhraseType | null = null;

  constructor() {
    const scaleLen = MODE_SCALES[this.mode]!.length;
    this.melodyPhraseType = pickPhraseType('drift');
    this.melodyDegrees = generatePhrase(scaleLen, this.melodyPhraseType, null);
    this.melodyNoteDurationBeats = melodyDurationBeats(this.melodyPhraseType, 'drift');
  }

  current(clock?: MusicalClock): HarmonicContext {
    return this.buildContext(
      this.movement.phase,
      this.movement.progress(),
      clock,
    );
  }

  advance(dt: number, clock: MusicalClock, knobs: SoundKnobs): void {
    this.evolutionPhase += dt * 0.0137;
    clock.update(dt, this.movement.phase, knobs);

    if (
      this.movement.phase === 'dissolve' &&
      Math.random() < 0.003 * dt * 60 * (0.5 + knobs.entropy)
    ) {
      this.maybeDriftMode(knobs.entropy);
    }

    if (clock.isNewBar()) {
      this.euclideanRotation =
        (this.euclideanRotation + 1 + Math.floor(knobs.entropy * 2)) % 8;
      this.melodyAccentPattern = euclidean(3, 8, this.euclideanRotation);
    }

    if (this.transitioning) {
      this.transitionT += dt;
      if (this.transitionT >= 25) {
        this.applyPending();
        this.transitioning = false;
        this.pendingTransitionBloom = true;
      }
    }

    if (this.movement.advance(dt)) {
      this.beginMovement(this.movement.index + 1, knobs);
    }

    const beatDur = clock.beatDurationSec();
    this.melodyTimer += dt;
    if (this.melodyTimer >= this.melodyNoteDurationBeats * beatDur) {
      this.melodyTimer = 0;
      this.advanceMelody(knobs);
    }
  }

  getMovementDensity(): number {
    return this.movement.density();
  }

  getMelodyPresence(): number {
    return this.movement.melodyPresence();
  }

  isHarmonicTransitioning(): boolean {
    return this.transitioning;
  }

  getHarmonicTransitionProgress(): number {
    return this.transitioning ? Math.min(1, this.transitionT / 25) : 0;
  }

  consumeTransitionBloom(): boolean {
    const v = this.pendingTransitionBloom;
    this.pendingTransitionBloom = false;
    return v;
  }

  consumePhraseCadence(): MelodyPhraseType | null {
    const v = this.pendingPhraseCadence;
    this.pendingPhraseCadence = null;
    return v;
  }

  /** Nudge to the next phase within the current movement */
  advanceToNextPhase(): MovementPhase | null {
    return this.movement.advanceToNextPhase();
  }

  /** Jump to a specific phase (used for dissolve bridge) */
  jumpToPhase(phase: MovementPhase): MovementPhase {
    return this.movement.jumpToPhase(phase);
  }

  /** Start a new movement with harmonic crossfade */
  skipToNextMovement(knobs: SoundKnobs): void {
    this.beginMovement(this.movement.index + 1, knobs);
  }

  private beginMovement(index: number, knobs: SoundKnobs): void {
    if (this.melodyPhraseType === 'hook' || this.melodyPhraseType === 'answer') {
      this.storedHook = [...this.melodyDegrees.slice(0, 4)];
    }

    this.movement = new Movement(index, pickMovementVariant(this.movement.variant));
    this.pendingRoot = this.pickNewRoot();
    this.pendingMode = this.pickNewMode();
    const initial = pickInitialChord(this.movement.phase);
    this.pendingChord = initial.degrees;
    this.pendingChordFn = initial.fn;
    this.pendingBrightness = initial.brightness;

    const scaleLen = MODE_SCALES[this.pendingMode ?? this.mode]!.length;
    const recall =
      knobs.memory > 0.4 && this.storedHook && Math.random() < knobs.memory * 0.65;
    this.melodyPhraseType = recall
      ? 'recall'
      : pickPhraseType(this.movement.phase);
    this.melodyDegrees = generatePhrase(
      scaleLen,
      this.melodyPhraseType,
      recall ? this.storedHook : null,
    );
    this.melodyNoteDurationBeats = melodyDurationBeats(
      this.melodyPhraseType,
      this.movement.phase,
    );
    this.melodyIndex = 0;
    this.melodyTimer = 0;
    this.phraseMemoryId++;
    this.transitioning = true;
    this.transitionT = 0;
  }

  private applyPending(): void {
    if (this.pendingRoot) this.root = this.pendingRoot;
    if (this.pendingMode) this.mode = this.pendingMode;
    if (this.pendingChord) this.chordDegrees = this.pendingChord;
    if (this.pendingChordFn) this.chordFunction = this.pendingChordFn;
    this.brightness = this.pendingBrightness;
    this.pendingRoot = null;
    this.pendingMode = null;
    this.pendingChord = null;
    this.pendingChordFn = null;
  }

  private maybeDriftMode(entropy: number): void {
    const neighbors = MODE_NEIGHBORS[this.mode];
    if (!neighbors || neighbors.length === 0) return;
    const next = neighbors[Math.floor(Math.random() * neighbors.length)]!;
    if (Math.random() < 0.3 + entropy * 0.4) {
      this.mode = next;
    }
  }

  private pickNewRoot(): (typeof ROOTS)[number] {
    const idx = ROOTS.indexOf(this.root);
    const weights = ROOTS.map((r, i) => {
      const dist = Math.abs(i - idx);
      const adj = dist === 0 ? 0.2 : dist === 1 ? 1.1 : 0.85;
      return adj * (ROOT_WEIGHTS[r] ?? 1);
    });
    return weightedPick([...ROOTS], weights);
  }

  private pickNewMode(): string {
    const names = Object.keys(MODE_SCALES);
    const weights = names.map((m) => {
      const base = MODE_WEIGHTS[m] ?? 0.5;
      return m === this.mode ? base * 0.25 : base;
    });
    return weightedPick(names, weights);
  }

  private advanceMelody(knobs: SoundKnobs): void {
    this.melodyIndex = (this.melodyIndex + 1) % this.melodyDegrees.length;
    this.accentStep++;

    const repeatChance = 0.25 + knobs.memory * 0.45;
    if (this.melodyIndex === 0 && Math.random() < repeatChance) {
      const scaleLen = MODE_SCALES[this.mode]!.length;
      if (Math.random() < knobs.memory * 0.5 && this.storedHook) {
        this.melodyPhraseType = 'recall';
        this.melodyDegrees = generatePhrase(scaleLen, 'recall', this.storedHook);
      } else {
        this.melodyPhraseType = pickPhraseType(this.movement.phase);
        this.melodyDegrees = generatePhrase(scaleLen, this.melodyPhraseType, this.storedHook);
      }
      this.melodyNoteDurationBeats = melodyDurationBeats(
        this.melodyPhraseType,
        this.movement.phase,
      );
      if (this.melodyPhraseType === 'hook' || this.melodyPhraseType === 'answer') {
        this.storedHook = [...this.melodyDegrees.slice(0, 4)];
      }
      this.pendingPhraseCadence = this.melodyPhraseType;
    } else if (this.melodyIndex === 0) {
      const next = pickNextChord(this.chordFunction, this.movement.phase, knobs.entropy);
      this.chordDegrees = next.degrees;
      this.chordFunction = next.fn;
      this.brightness = next.brightness;
      this.pendingPhraseCadence = 'drift';
    }
  }

  private buildContext(
    phase: MovementPhase,
    progress: number,
    clock?: MusicalClock,
  ): HarmonicContext {
    const scale = [...MODE_SCALES[this.mode]!];
    return {
      root: this.root,
      rootMidi: ROOT_MIDI[this.root],
      scale,
      mode: this.mode,
      evolutionPhase: this.evolutionPhase,
      chordDegrees: [...this.chordDegrees],
      chordFunction: this.chordFunction,
      brightness: this.brightness,
      melodyDegrees: [...this.melodyDegrees],
      melodyPhraseType: this.melodyPhraseType,
      melodyNoteDurationBeats: this.melodyNoteDurationBeats,
      melodyAccentPattern: [...this.melodyAccentPattern],
      phraseMemoryId: this.phraseMemoryId,
      melodyIndex: this.melodyIndex,
      movementPhase: phase,
      movementProgress: progress,
      movementIndex: this.movement.index,
      ensemblePulse: 0,
      gestureId: 0,
      surpriseFlash: 0,
      inhaleGesture: 0,
      spaceThrowGesture: 0,
      cadenceRipple: 0,
      groupActivity: { bed: 0, melody: 0, shimmer: 0, air: 0, foundation: 0, flurry: 0, clips: 0 },
      beatPulse: clock?.beatPulse ?? 0,
      currentBar: clock?.currentBar ?? 0,
      beatInBar: clock?.beatInBar ?? 0,
    };
  }
}

export function noteFromDegree(
  ctx: HarmonicContext,
  degreeIndex: number,
  octave = 0,
): string {
  const idx =
    ((degreeIndex % ctx.scale.length) + ctx.scale.length) % ctx.scale.length;
  const semitones = ctx.scale[idx]! + octave * 12;
  return Tone.Frequency(ctx.rootMidi + semitones, 'midi').toNote();
}

export function chordNotes(ctx: HarmonicContext, octave = 0): string[] {
  return ctx.chordDegrees.map((d) => noteFromDegree(ctx, d, octave));
}

export function currentMelodyNote(ctx: HarmonicContext, octave = 1): string {
  const deg = ctx.melodyDegrees[ctx.melodyIndex] ?? 0;
  return noteFromDegree(ctx, deg, octave);
}

export function isMelodyAccent(ctx: HarmonicContext, step = 0): boolean {
  const pattern = ctx.melodyAccentPattern;
  if (pattern.length === 0) return false;
  return pattern[step % pattern.length] ?? false;
}
