export type VoiceState =
  | 'dormant'
  | 'fadingIn'
  | 'sustaining'
  | 'morphing'
  | 'fadingOut';

export type MovementPhase =
  | 'drift'
  | 'gather'
  | 'bloom'
  | 'hang'
  | 'dissolve'
  | 'exhale';

export type ChordFunction = 'tonic' | 'subdominant' | 'dominant' | 'color';

export type MelodyPhraseType = 'hook' | 'answer' | 'ladder' | 'drift' | 'recall';

export type VoiceGroup =
  | 'bed'
  | 'melody'
  | 'shimmer'
  | 'air'
  | 'foundation'
  | 'flurry'
  | 'clips';

export const VOICE_GROUPS: Record<VoiceGroup, readonly string[]> = {
  bed: ['harmonyBed', 'warmPad', 'modalStrings', 'orchestraWhole'],
  melody: ['dreamMelody', 'slowArp', 'tapeChoir', 'crystalCluster'],
  shimmer: ['glassPad', 'harmonicGhost', 'distantBell'],
  air: ['airTexture', 'roomTone', 'fieldRecording'],
  foundation: ['subDrone', 'deepPressure'],
  flurry: ['melodicFlurry', 'sparkRun'],
  clips: ['hymnClip', 'arpClip', 'phraseClip', 'textureClip', 'washClip'],
};

export type GroupActivity = Record<VoiceGroup, number>;

export const EMPTY_GROUP_ACTIVITY: GroupActivity = {
  bed: 0,
  melody: 0,
  shimmer: 0,
  air: 0,
  foundation: 0,
  flurry: 0,
  clips: 0,
};

/** Blend weights for layered visual modalities (0–1) */
export interface ModalityWeights {
  rings: number;
  streamers: number;
  spark: number;
  ghost: number;
  pulse: number;
}

export interface HarmonicContext {
  root: string;
  rootMidi: number;
  scale: number[];
  mode: string;
  evolutionPhase: number;
  /** Scale-degree indices forming the current chord */
  chordDegrees: number[];
  chordFunction: ChordFunction;
  brightness: number;
  /** Dream melody phrase as scale-degree indices */
  melodyDegrees: number[];
  melodyPhraseType: MelodyPhraseType;
  melodyNoteDurationBeats: number;
  melodyAccentPattern: boolean[];
  phraseMemoryId: number;
  /** Current position in melody phrase */
  melodyIndex: number;
  movementPhase: MovementPhase;
  /** 0–1 progress through the current movement */
  movementProgress: number;
  /** Movement number (always increasing, never loops) */
  movementIndex: number;
  /** Decaying pulse when the ensemble plays together (0–1) */
  ensemblePulse: number;
  /** Increments on each ensemble gesture — sync cue for voices/visuals */
  gestureId: number;
  /** Brief flash for surprise visual moments (0–1) */
  surpriseFlash: number;
  /** Pre-ensemble inhale — field contracts, trails tighten (0–1, decaying) */
  inhaleGesture: number;
  /** Space throw — ink blooms outward (0–1, decaying) */
  spaceThrowGesture: number;
  /** Phrase cadence — expanding ring ripple through the ghost field (0–1, decaying) */
  cadenceRipple: number;
  /** Downbeat pulse for visuals (0–1) */
  beatPulse: number;
  /** Per voice-group activity (0–1), from active voices */
  groupActivity: GroupActivity;
  currentBar: number;
  beatInBar: number;
}

export interface SoundKnobs {
  warmth: number;
  space: number;
  activity: number;
  memory: number;
  entropy: number;
  pulse: number;
  /** Sub — foundation layer weight (sub drone + deep pressure). */
  foundation: number;
  /** Stereo image: 0 = mono-ish/intimate, 1 = wide/enveloping. */
  width: number;
  /** Air/room-tone/granular texture layer weight. */
  texture: number;
}

export interface VisualKnobs {
  grain: number;
  ripple: number;
  drift: number;
  /** 0 = ghost-heavy (70/30), 0.5 = even, 1 = body-heavy (30/70) */
  focus: number;
  /** Ink-trail persistence: 0 = crisp, 1 = long streaks. */
  trails: number;
  /** Fog depth override blended over the art director's phase breathing. */
  fog: number;
}

export interface AppKnobs {
  sound: SoundKnobs;
  visual: VisualKnobs;
}

// New knobs default to 0.5 and every formula they feed is neutral at 0.5,
// so calibrations saved before they existed sound and look identical.
export const DEFAULT_KNOBS: AppKnobs = {
  sound: {
    warmth: 0.55,
    space: 0.5,
    activity: 0.35,
    memory: 0.45,
    entropy: 0.4,
    pulse: 0.5,
    foundation: 0.5,
    width: 0.5,
    texture: 0.5,
  },
  visual: { grain: 0.45, ripple: 0.5, drift: 0.4, focus: 0.28, trails: 0.5, fog: 0.5 },
};

export interface AudioFeatures {
  bass: number;
  mids: number;
  highs: number;
  overall: number;
}

export const CHORD_POOLS: number[][] = [
  [0, 2, 4],
  [0, 1, 3],
  [0, 2, 3, 5],
  [0, 1, 4],
  [0, 2, 4, 6],
  [0, 1, 3, 5],
];

export const MODE_SCALES: Record<string, number[]> = {
  lydian: [0, 2, 4, 6, 7, 9, 11],
  major7: [0, 2, 4, 5, 7, 9, 11],
  pentatonic: [0, 2, 4, 7, 9],
  susWash: [0, 2, 5, 7, 9, 12],
  tropicalBright: [0, 2, 4, 6, 7, 9, 11],
  dreamMinor: [0, 2, 3, 5, 7, 8, 11],
  minorAdd9: [0, 2, 3, 5, 7, 10, 14],
};

export const MODE_NAMES = Object.keys(MODE_SCALES);

export const MODE_WEIGHTS: Record<string, number> = {
  lydian: 1.4,
  major7: 1.3,
  pentatonic: 1.1,
  susWash: 1.0,
  tropicalBright: 1.35,
  dreamMinor: 0.35,
  minorAdd9: 0.25,
};

/** Adjacent modes for entropy drift */
export const MODE_NEIGHBORS: Record<string, string[]> = {
  lydian: ['major7', 'tropicalBright'],
  major7: ['lydian', 'pentatonic'],
  pentatonic: ['major7', 'susWash'],
  susWash: ['pentatonic', 'tropicalBright'],
  tropicalBright: ['lydian', 'major7'],
  dreamMinor: ['minorAdd9', 'pentatonic'],
  minorAdd9: ['dreamMinor', 'susWash'],
};
