import type { VoiceBase } from './VoiceBase';
import { MusicalClock } from './MusicalClock';
import type { ConductorFx } from './ConductorFx';
import { noopConductorFx } from './ConductorFx';
import type {
  GroupActivity,
  HarmonicContext,
  MelodyPhraseType,
  SoundKnobs,
  VoiceGroup,
} from './types';
import { VOICE_GROUPS } from './types';
import { HarmonicField } from './HarmonicField';

const ENSEMBLE_VOICES = [
  'orchestraWhole',
  'harmonyBed',
  'warmPad',
  'modalStrings',
  'tapeChoir',
  'dreamMelody',
];

const WHISPER_VOICES = ['distantBell', 'harmonicGhost'] as const;
const RETURN_GROUPS: VoiceGroup[] = ['shimmer', 'air'];

const CORE_IDS = new Set(['orchestraWhole', 'harmonyBed', 'warmPad', 'dreamMelody']);

function gaussianRandom(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function expRandom(min: number, max: number): number {
  const u = Math.random();
  return min + (-Math.log(1 - u) * (max - min)) / 3;
}

export class Conductor {
  readonly harmonicField = new HarmonicField();
  readonly clock = new MusicalClock();
  interest = 0.4;
  private targetInterest = 0.4;
  private timeSinceEvent = 0;
  private nextEventIn = 30;
  private timeSinceGesture = 0;
  private nextGestureIn = 35;
  private timeSinceFlurry = 0;
  private nextFlurryIn = 14;
  private timeSinceSurprise = 0;
  private nextSurpriseIn = 25;
  private timeSinceClip = 0;
  private nextClipIn = 50;
  private timeSinceWhisper = 0;
  private nextWhisperIn = 40;
  private recentHistory: string[] = [];
  private readonly historySize = 10;
  private started = false;
  private lastPhase = 'drift';
  private lastMelodyIndex = 0;
  private pendingClipTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingGesture = false;
  private ensembleCooldown = 0;
  private pendingMovementSkip = false;
  private dissolveBridgeT = 0;
  private inhaleTriggered = false;
  private foundationBarsRemaining = 0;
  inhaleGesture = 0;
  spaceThrowGesture = 0;
  cadenceRipple = 0;
  private static readonly DISSOLVE_BRIDGE_SEC = 10;
  private static readonly PRE_ENSEMBLE_INHALE_SEC = 0.85;
  ensemblePulse = 0;
  gestureId = 0;
  surpriseFlash = 0;

  constructor(
    private readonly voices: VoiceBase[],
    private knobs: SoundKnobs,
    private readonly fx: ConductorFx = noopConductorFx,
  ) {}

  setKnobs(knobs: SoundKnobs): void {
    this.knobs = knobs;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.clock.init();

    const ctx = this.getHarmonicContext();
    for (const id of ['orchestraWhole', 'harmonyBed', 'warmPad', 'dreamMelody']) {
      const voice = this.voices.find((v) => v.id === id);
      voice?.enter(ctx);
      if (voice) this.recordActivation(voice.id);
    }

    this.nextEventIn = expRandom(12, 35);
    this.nextGestureIn = expRandom(25, 55);
    this.nextFlurryIn = expRandom(12, 30);
    this.nextClipIn = expRandom(35, 80);
    this.nextWhisperIn = expRandom(35, 90);
  }

  update(dt: number): void {
    if (!this.started) return;

    if (this.pendingMovementSkip) {
      this.dissolveBridgeT += dt;
      if (this.dissolveBridgeT >= Conductor.DISSOLVE_BRIDGE_SEC) {
        this.executeMovementSkip();
      }
    }

    this.harmonicField.advance(dt, this.clock, this.knobs);
    const ctx = this.getHarmonicContext();

    if (this.harmonicField.consumeTransitionBloom()) {
      this.onCrossfadeBloom(ctx);
    }

    const cadence = this.harmonicField.consumePhraseCadence();
    if (cadence) {
      this.onPhraseCadence(ctx, cadence);
    }

    this.ensemblePulse = Math.max(0, this.ensemblePulse - dt * 0.35);
    this.surpriseFlash = Math.max(0, this.surpriseFlash - dt * 0.8);
    this.inhaleGesture = Math.max(0, this.inhaleGesture - dt * 2.4);
    this.spaceThrowGesture = Math.max(0, this.spaceThrowGesture - dt * 0.38);
    this.cadenceRipple = Math.max(0, this.cadenceRipple - dt * 1.6);
    this.ensembleCooldown = Math.max(0, this.ensembleCooldown - dt);

    if (ctx.melodyIndex !== this.lastMelodyIndex) {
      if (Math.random() < 0.45) {
        this.surpriseFlash = 0.5 + Math.random() * 0.35;
      }
      this.lastMelodyIndex = ctx.melodyIndex;
    }

    for (const voice of this.voices) {
      if (voice.isActive()) {
        voice.syncContext(ctx);
      }
    }

    const density = this.harmonicField.getMovementDensity();
    // Melody knob scales phase-driven presence — neutral at the 0.45 default.
    const melodyPresence = Math.min(
      1,
      this.harmonicField.getMelodyPresence() * (0.5 + this.knobs.memory * 1.1),
    );
    this.targetInterest = 0.2 + density * 0.55 + this.knobs.activity * 0.15;

    const activity = this.knobs.activity;
    this.interest +=
      (this.targetInterest - this.interest) * (0.018 + activity * 0.012) +
      gaussianRandom() * 0.003;
    this.interest = Math.max(0.2, Math.min(0.9, this.interest));

    if (ctx.movementPhase !== this.lastPhase) {
      this.cancelClipTimeout();
      this.onPhaseChange(ctx, melodyPresence);
      this.lastPhase = ctx.movementPhase;
    }

    const inhaleAt = this.nextGestureIn - Conductor.PRE_ENSEMBLE_INHALE_SEC;
    if (
      !this.inhaleTriggered &&
      this.timeSinceGesture >= Math.max(0, inhaleAt) &&
      this.timeSinceGesture < this.nextGestureIn
    ) {
      this.triggerVisualInhale();
      this.inhaleTriggered = true;
    }

    this.timeSinceGesture += dt;
    if (this.timeSinceGesture >= this.nextGestureIn) {
      if (this.clock.isDownbeat() || ctx.movementPhase !== 'bloom') {
        this.triggerEnsemble(ctx);
        this.timeSinceGesture = 0;
        this.inhaleTriggered = false;
        this.nextGestureIn = expRandom(28, 70) / (0.6 + density * 0.5);
      } else {
        this.pendingGesture = true;
      }
    }
    if (this.pendingGesture && this.clock.isDownbeat()) {
      this.triggerEnsemble(ctx);
      this.pendingGesture = false;
      this.timeSinceGesture = 0;
      this.inhaleTriggered = false;
      this.nextGestureIn = expRandom(28, 70) / (0.6 + density * 0.5);
    }

    this.timeSinceFlurry += dt;
    // Flourishes are the "unexpected moments" — allow them in every phase but
    // the final exhale, and on a much tighter cadence so they recur throughout.
    const flurryPhase = ctx.movementPhase !== 'exhale';
    if (flurryPhase && this.timeSinceFlurry >= this.nextFlurryIn) {
      this.maybeTriggerFlurry(ctx, density);
      this.timeSinceFlurry = 0;
      // Cadence ebbs and flows within a movement: a 1.5-cycle wave over the
      // movement progress clusters flourishes into dense and sparse sections,
      // weighted by phase so bloom/hang feel busiest.
      const sectionPulse = 0.5 + 0.5 * Math.sin(ctx.movementProgress * Math.PI * 3);
      const phaseDrive =
        ctx.movementPhase === 'bloom' || ctx.movementPhase === 'hang'
          ? 1.4
          : ctx.movementPhase === 'gather'
            ? 1.1
            : 0.7;
      const flurryRate = phaseDrive * (0.55 + sectionPulse * 0.9);
      this.nextFlurryIn = expRandom(14, 38) / ((0.6 + activity * 0.5) * flurryRate);
    }

    this.timeSinceSurprise += dt;
    if (this.timeSinceSurprise >= this.nextSurpriseIn) {
      if (Math.random() < 0.55 + activity * 0.2) {
        this.surpriseFlash = 0.65 + Math.random() * 0.35;
        if (Math.random() < 0.4) this.triggerEnsemble(ctx, 0.6);
        if (ctx.movementPhase === 'bloom' && Math.random() < 0.35) {
          this.triggerVisualSpaceThrow(3);
        }
      }
      this.timeSinceSurprise = 0;
      this.nextSurpriseIn = expRandom(18, 55);
    }

    this.timeSinceWhisper += dt;
    const whisperPhase = ctx.movementPhase === 'hang' || ctx.movementPhase === 'drift';
    if (whisperPhase && this.timeSinceWhisper >= this.nextWhisperIn) {
      this.maybeWhisperPing(ctx);
      this.timeSinceWhisper = 0;
      this.nextWhisperIn = expRandom(28, 75) / (0.45 + activity * 0.35);
    }

    if (
      this.foundationBarsRemaining <= 0 &&
      this.clock.isDownbeat() &&
      (ctx.movementPhase === 'bloom' || ctx.movementPhase === 'dissolve') &&
      Math.random() < 0.12 + this.knobs.entropy * 0.18
    ) {
      this.triggerFoundationAnchor(ctx);
    }
    if (this.foundationBarsRemaining > 0) {
      this.foundationBarsRemaining -= dt / (this.clock.beatDurationSec() * 4);
      if (this.foundationBarsRemaining <= 0) {
        this.voices.find((v) => v.id === 'subDrone')?.exit();
      }
    }

    this.timeSinceEvent += dt;
    if (this.timeSinceEvent >= this.nextEventIn) {
      this.scheduleLayer(ctx, density, melodyPresence);
      this.timeSinceEvent = 0;
      this.nextEventIn =
        expRandom(10, 38) / (0.7 + activity * 0.6 + density * 0.5);
    }

    this.timeSinceClip += dt;
    const clipPhase =
      ctx.movementPhase === 'bloom' ||
      ctx.movementPhase === 'hang' ||
      ctx.movementPhase === 'gather' ||
      ctx.movementPhase === 'drift';
    if (clipPhase && this.timeSinceClip >= this.nextClipIn) {
      if (this.clock.isDownbeat() || ctx.movementPhase === 'drift') {
        this.maybeTriggerClip(ctx, density);
        this.timeSinceClip = 0;
        this.nextClipIn =
          expRandom(30, 90) /
          (0.5 + density * 0.4 + activity * 0.3 + this.knobs.memory * 0.25);
      }
    }

    this.trimExcess();

    for (const voice of this.voices) {
      voice.update(dt, this.interest, this.knobs);
    }
  }

  private onCrossfadeBloom(ctx: HarmonicContext): void {
    this.triggerEnsemble(ctx, 0.4);
    for (const id of VOICE_GROUPS.bed) {
      const voice = this.voices.find((v) => v.id === id);
      if (voice?.isActive()) {
        voice.onHarmonicShift(ctx);
      }
    }
    this.surpriseFlash = Math.max(this.surpriseFlash, 0.45);
  }

  private onPhraseCadence(ctx: HarmonicContext, type: MelodyPhraseType): void {
    if (type === 'recall' || type === 'hook' || type === 'answer') {
      this.triggerEnsemble(ctx, 0.35);
      this.surpriseFlash = Math.max(this.surpriseFlash, 0.55);
      this.cadenceRipple = 1;
    } else if (type === 'drift') {
      this.fx.triggerThinMix(1.1);
    }
  }

  private triggerFoundationAnchor(ctx: HarmonicContext): void {
    const sub = this.voices.find((v) => v.id === 'subDrone');
    if (!sub || sub.isActive()) return;
    sub.enter(ctx);
    this.recordActivation('subDrone');
    this.foundationBarsRemaining = 8 + Math.floor(Math.random() * 9);
  }

  private maybeWhisperPing(ctx: HarmonicContext): void {
    if (Math.random() > 0.35 + this.knobs.activity * 0.25) return;
    const id = WHISPER_VOICES[Math.floor(Math.random() * WHISPER_VOICES.length)]!;
    const voice = this.voices.find((v) => v.id === id);
    if (!voice || voice.isActive()) return;
    voice.enter(ctx);
    this.recordActivation(id);
    this.surpriseFlash = Math.max(this.surpriseFlash, 0.35);
    const whisperId = id;
    setTimeout(() => {
      this.voices.find((v) => v.id === whisperId)?.exit();
    }, 3500 + Math.random() * 2500);
  }

  private cancelClipTimeout(): void {
    if (this.pendingClipTimeout) {
      clearTimeout(this.pendingClipTimeout);
      this.pendingClipTimeout = null;
    }
  }

  private triggerVisualInhale(): void {
    this.inhaleGesture = 1;
    this.fx.triggerPreEnsembleInhale();
  }

  private triggerVisualSpaceThrow(durationSec?: number): void {
    this.spaceThrowGesture = 1;
    this.fx.triggerSpaceThrow(durationSec);
  }

  private triggerEnsemble(ctx: HarmonicContext, strength = 1): void {
    if (strength >= 0.5 && this.ensembleCooldown > 0) return;
    this.ensembleCooldown = strength >= 0.75 ? 10 : 5;

    this.ensemblePulse = strength;
    this.gestureId++;
    this.surpriseFlash = Math.max(this.surpriseFlash, 0.35 * strength);

    for (const id of ENSEMBLE_VOICES) {
      this.activateVoice(id, ctx);
    }
  }

  private maybeTriggerFlurry(ctx: HarmonicContext, density: number): void {
    if (Math.random() > 0.78 + density * 0.2) return;

    const pick = Math.random() < 0.55 ? 'melodicFlurry' : 'sparkRun';
    const voice = this.voices.find((v) => v.id === pick);
    if (voice && !voice.isActive()) {
      voice.enter(ctx);
      this.recordActivation(pick);
      this.surpriseFlash = Math.max(this.surpriseFlash, 0.55);
    } else if (pick === 'melodicFlurry') {
      this.activateVoice('sparkRun', ctx);
    }
  }

  private maybeTriggerClip(ctx: HarmonicContext, density: number): void {
    const memoryBoost = this.knobs.memory * 0.25;
    if (Math.random() > 0.35 + density * 0.35 + memoryBoost) return;

    const activeClips = this.voices.filter(
      (v) => v.isActive() && VOICE_GROUPS.clips.includes(v.id),
    );
    if (activeClips.length >= 2) return;

    this.activateFromGroup('clips', ctx);

    if (density > 0.5 && Math.random() < 0.25 + this.knobs.memory * 0.35) {
      this.cancelClipTimeout();
      this.pendingClipTimeout = setTimeout(() => {
        this.activateFromGroup('clips', this.getHarmonicContext());
        this.pendingClipTimeout = null;
      }, 800 + Math.random() * 2000);
    }
  }

  private onPhaseChange(ctx: HarmonicContext, melodyPresence: number): void {
    switch (ctx.movementPhase) {
      case 'gather':
        this.activateGroup('bed', ctx);
        this.triggerEnsemble(ctx, 0.55);
        // Reset the cycle's special textures.
        this.voices.find((v) => v.id === 'rhythmicPulse')?.exit();
        this.voices.find((v) => v.id === 'granularTexture')?.exit();
        break;
      case 'bloom':
        this.activateGroup('bed', ctx);
        this.activateGroup('melody', ctx);
        this.activateGroup('shimmer', ctx);
        this.triggerEnsemble(ctx, 0.85);
        this.activateVoice('rhythmicPulse', ctx);
        if (Math.random() < 0.4) this.triggerVisualSpaceThrow(3.5);
        break;
      case 'hang':
        this.activateGroup('melody', ctx);
        if (melodyPresence > 0.5 && Math.random() < 0.5) {
          this.maybeTriggerFlurry(ctx, 0.8);
        }
        break;
      case 'dissolve':
        this.fadeGroup('shimmer');
        this.fadeGroup('air');
        this.fadeGroup('flurry');
        this.voices.find((v) => v.id === 'rhythmicPulse')?.exit();
        this.activateVoice('granularTexture', ctx);
        if (Math.random() < 0.4 + this.knobs.entropy * 0.3) {
          this.activateFromGroup('clips', ctx);
        }
        if (this.knobs.entropy > 0.55 && Math.random() < this.knobs.entropy * 0.45) {
          this.maybeTriggerFlurry(ctx, 0.65);
          this.triggerVisualSpaceThrow(2.5);
        }
        break;
      case 'exhale':
        this.fadeGroup('melody');
        this.fadeGroup('shimmer');
        this.fadeGroup('flurry');
        this.fadeGroup('clips');
        this.fx.triggerExhaleVacuum();
        setTimeout(() => {
          const c = this.getHarmonicContext();
          this.activateVoice('orchestraWhole', c);
          this.activateVoice('harmonyBed', c);
          this.activateVoice('glassPad', c);
        }, 1800);
        break;
    }
  }

  private scheduleLayer(
    ctx: HarmonicContext,
    density: number,
    melodyPresence: number,
  ): void {
    const activeCount = this.voices.filter((v) => v.isActive()).length;
    const maxVoices = Math.floor(4 + density * 7 + this.knobs.activity * 3.5);

    if (activeCount >= maxVoices) {
      this.trimExcess(true);
      return;
    }

    if (Math.random() < 0.15 && this.recentHistory.length > 0) {
      if (this.tryReturnVoice(ctx)) return;
    }

    if (Math.random() < 0.22) {
      this.activateFromGroup('bed', ctx);
      this.handoffMelody(ctx);
      return;
    }

    const roll = Math.random();
    if (roll < melodyPresence * 0.38) {
      this.handoffMelody(ctx);
    } else if (roll < melodyPresence * 0.38 + density * 0.32) {
      this.activateFromGroup('bed', ctx);
    } else if (roll < melodyPresence * 0.38 + density * 0.32 + 0.22) {
      this.activateFromGroup('shimmer', ctx);
    } else {
      this.activateFromGroup('air', ctx);
    }

    if (density > 0.55 && Math.random() < 0.2) {
      this.activateVoice('subDrone', ctx);
    }
  }

  private tryReturnVoice(ctx: HarmonicContext): boolean {
    const recent = [...this.recentHistory].reverse();
    for (const id of recent) {
      const group = (Object.keys(VOICE_GROUPS) as VoiceGroup[]).find((g) =>
        VOICE_GROUPS[g].includes(id),
      );
      if (!group || !RETURN_GROUPS.includes(group)) continue;
      const voice = this.voices.find((v) => v.id === id);
      if (voice && !voice.isActive()) {
        voice.enter(ctx);
        this.recordActivation(id);
        return true;
      }
    }
    return false;
  }

  private handoffMelody(ctx: HarmonicContext): void {
    const melodyIds = VOICE_GROUPS.melody;
    const activeMelody = this.voices.filter(
      (v) => v.isActive() && melodyIds.includes(v.id),
    );
    if (activeMelody.length >= 2) {
      activeMelody[0]?.exit();
    }
    this.activateFromGroup('melody', ctx);
  }

  private activateGroup(group: VoiceGroup, ctx: HarmonicContext): void {
    for (const id of VOICE_GROUPS[group]) {
      this.activateVoice(id, ctx);
    }
  }

  private activateFromGroup(group: VoiceGroup, ctx: HarmonicContext): void {
    const ids = VOICE_GROUPS[group];
    const dormant = ids
      .map((id) => this.voices.find((v) => v.id === id))
      .filter((v): v is VoiceBase => !!v && !v.isActive());
    if (dormant.length === 0) return;

    const avoid = new Set(this.recentHistory.slice(-4));
    const fresh = dormant.filter((v) => !avoid.has(v.id));
    const pool = fresh.length > 0 ? fresh : dormant;
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    pick.enter(ctx);
    this.recordActivation(pick.id);
  }

  private activateVoice(id: string, ctx: HarmonicContext): void {
    const voice = this.voices.find((v) => v.id === id);
    if (voice && !voice.isActive()) {
      voice.enter(ctx);
      this.recordActivation(id);
    }
  }

  private fadeGroup(group: VoiceGroup): void {
    for (const id of VOICE_GROUPS[group]) {
      if (!CORE_IDS.has(id)) {
        this.voices.find((v) => v.id === id)?.exit();
      }
    }
  }

  private trimExcess(force = false): void {
    const active = this.voices.filter((v) => v.isActive());
    const density = this.harmonicField.getMovementDensity();
    const maxVoices = Math.floor(3 + density * 8 + this.knobs.activity * 3.5);

    if (active.length <= 4) return;
    if (active.length <= maxVoices && !force) return;

    const removable = active.filter((v) => !CORE_IDS.has(v.id));
    if (removable.length === 0) return;

    removable[Math.floor(Math.random() * removable.length)]?.exit();
  }

  private recordActivation(id: string): void {
    this.recentHistory.push(id);
    if (this.recentHistory.length > this.historySize) {
      this.recentHistory.shift();
    }
  }

  getGroupActivity(): GroupActivity {
    const activity: GroupActivity = {
      bed: 0,
      melody: 0,
      shimmer: 0,
      air: 0,
      foundation: 0,
      flurry: 0,
      clips: 0,
    };

    for (const group of Object.keys(VOICE_GROUPS) as VoiceGroup[]) {
      const ids = VOICE_GROUPS[group];
      let active = 0;
      for (const id of ids) {
        if (this.voices.find((v) => v.id === id)?.isActive()) active++;
      }
      activity[group] = active / ids.length;
    }

    return activity;
  }

  getHarmonicContext(): HarmonicContext {
    return {
      ...this.harmonicField.current(this.clock),
      ensemblePulse: this.ensemblePulse,
      gestureId: this.gestureId,
      surpriseFlash: this.surpriseFlash,
      inhaleGesture: this.inhaleGesture,
      spaceThrowGesture: this.spaceThrowGesture,
      cadenceRipple: this.cadenceRipple,
      groupActivity: this.getGroupActivity(),
    };
  }

  getInterest(): number {
    return this.interest;
  }

  isPendingMovementSkip(): boolean {
    return this.pendingMovementSkip;
  }

  isHarmonicTransitioning(): boolean {
    return this.harmonicField.isHarmonicTransitioning();
  }

  getHarmonicTransitionProgress(): number {
    return this.harmonicField.getHarmonicTransitionProgress();
  }

  requestNextPhase(): void {
    if (!this.started || this.pendingMovementSkip) return;

    const next = this.harmonicField.advanceToNextPhase();
    if (next === null) {
      this.requestNextMovement();
      return;
    }

    const ctx = this.getHarmonicContext();
    this.onPhaseChange(ctx, this.harmonicField.getMelodyPresence());
    this.lastPhase = next;
  }

  requestNextMovement(): void {
    if (!this.started || this.pendingMovementSkip) return;

    const phase = this.getHarmonicContext().movementPhase;
    if (phase !== 'dissolve' && phase !== 'exhale') {
      this.harmonicField.jumpToPhase('dissolve');
      this.onPhaseChange(
        this.getHarmonicContext(),
        this.harmonicField.getMelodyPresence(),
      );
      this.lastPhase = 'dissolve';
      this.pendingMovementSkip = true;
      this.dissolveBridgeT = 0;
      return;
    }

    this.executeMovementSkip();
  }

  private executeMovementSkip(): void {
    this.cancelClipTimeout();
    this.fadeGroup('shimmer');
    this.fadeGroup('air');
    this.fadeGroup('flurry');
    this.fadeGroup('clips');
    this.harmonicField.skipToNextMovement(this.knobs);
    this.lastPhase = 'drift';
    this.pendingMovementSkip = false;
    this.dissolveBridgeT = 0;
  }
}
