import * as Tone from 'tone';

/**
 * The instrument's voice palette.
 *
 * Every preset is a performance reading of a voice the orchestra already
 * plays, so playing sounds like the same ensemble rather than a synth pasted
 * on top of it. What changes is the envelope: the generative versions open
 * over two to six seconds, which is right for a bed that swells in and wrong
 * for a key you press. These attack in tens of milliseconds and keep the long
 * releases, so a chord still dissolves into the room the way the field does.
 */
export interface PlayPreset {
  id: string;
  /** Short label — the panel row and the pads are both this narrow. */
  label: string;
  /** Which orchestra voice this is a playable reading of. */
  origin: string;
  /** Built fresh on selection; disposed after the previous one's tail. */
  create(): Tone.PolySynth;
  maxPolyphony: number;
  /** Output trim — brighter presets need pulling back against the darker ones. */
  gain: number;
  /** Release tail in seconds — how long to wait before disposing the synth. */
  releaseSec: number;
  /**
   * Filter cutoff in Hz. `rest` is where the voice sits with no mod wheel
   * touched — the instrument has to sound right for someone playing it on a
   * computer keyboard with no wheel at all — and the wheel opens it toward
   * `max` from there. So the wheel adds shimmer rather than being the only
   * thing standing between you and a muffled instrument.
   */
  cutoff: { rest: number; max: number };
}

export const PLAY_PRESETS: PlayPreset[] = [
  {
    id: 'glass',
    label: 'Glass',
    origin: 'glassPad',
    maxPolyphony: 10,
    gain: 0.5,
    releaseSec: 12,
    cutoff: { rest: 7000, max: 13000 },
    create: () =>
      new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3,
        modulationIndex: 1.4,
        envelope: { attack: 0.04, decay: 1.2, sustain: 0.55, release: 6 },
        modulationEnvelope: { attack: 0.12, decay: 0.6, sustain: 0.4, release: 4 },
      }),
  },
  {
    id: 'choir',
    label: 'Choir',
    origin: 'tapeChoir',
    maxPolyphony: 8,
    gain: 0.42,
    releaseSec: 14,
    cutoff: { rest: 4200, max: 9000 },
    create: () =>
      new Tone.PolySynth(Tone.MonoSynth, {
        oscillator: { type: 'fatsawtooth', spread: 18, count: 3 },
        envelope: { attack: 0.09, decay: 1.6, sustain: 0.68, release: 7 },
        filter: { type: 'lowpass', rolloff: -12, Q: 1 },
        filterEnvelope: {
          attack: 0.14,
          decay: 2.4,
          sustain: 0.5,
          release: 6,
          baseFrequency: 260,
          octaves: 2.6,
        },
      }),
  },
  {
    id: 'bell',
    label: 'Bell',
    origin: 'distantBell',
    maxPolyphony: 12,
    gain: 0.4,
    releaseSec: 8,
    cutoff: { rest: 9000, max: 15000 },
    create: () =>
      new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 4.5,
        modulationIndex: 1.5,
        // A struck bell ignores how long you hold it — decay is the note.
        envelope: { attack: 0.005, decay: 3.5, sustain: 0.08, release: 5 },
      }),
  },
  {
    id: 'crystal',
    label: 'Crystal',
    origin: 'crystalCluster',
    maxPolyphony: 12,
    gain: 0.34,
    releaseSec: 6,
    cutoff: { rest: 11000, max: 17000 },
    create: () =>
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.008, decay: 2.2, sustain: 0.14, release: 4.5 },
      }),
  },
  {
    id: 'strings',
    label: 'Strings',
    origin: 'modalStrings',
    maxPolyphony: 8,
    gain: 0.4,
    releaseSec: 12,
    cutoff: { rest: 4000, max: 8500 },
    create: () =>
      new Tone.PolySynth(Tone.MonoSynth, {
        oscillator: { type: 'fatsawtooth', spread: 30, count: 3 },
        // A bowed note needs the bow to reach the string — the slowest
        // attack here, still inside what reads as a keypress.
        envelope: { attack: 0.18, decay: 1.4, sustain: 0.75, release: 8 },
        filter: { type: 'lowpass', rolloff: -12, Q: 1.2 },
        filterEnvelope: {
          attack: 0.3,
          decay: 2.6,
          sustain: 0.58,
          release: 7,
          baseFrequency: 220,
          octaves: 2.8,
        },
      }),
  },
  {
    id: 'warm',
    label: 'Warm',
    origin: 'warmPad',
    maxPolyphony: 8,
    gain: 0.46,
    releaseSec: 14,
    cutoff: { rest: 3400, max: 7500 },
    create: () =>
      new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 1.5,
        oscillator: { type: 'sine' },
        modulation: { type: 'sine' },
        envelope: { attack: 0.11, decay: 2, sustain: 0.72, release: 9 },
        modulationEnvelope: { attack: 0.4, decay: 1.5, sustain: 0.5, release: 6 },
      }),
  },
  {
    id: 'reed',
    label: 'Reed',
    origin: 'slowArp',
    maxPolyphony: 10,
    gain: 0.36,
    releaseSec: 6,
    cutoff: { rest: 6500, max: 12000 },
    create: () =>
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'square4' },
        envelope: { attack: 0.02, decay: 0.9, sustain: 0.42, release: 3.5 },
      }),
  },
  {
    id: 'ghost',
    label: 'Ghost',
    origin: 'harmonicGhost',
    maxPolyphony: 10,
    gain: 0.34,
    releaseSec: 16,
    cutoff: { rest: 5200, max: 10000 },
    create: () =>
      new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 2.02,
        modulationIndex: 3.2,
        envelope: { attack: 0.25, decay: 3, sustain: 0.4, release: 11 },
        modulationEnvelope: { attack: 1.2, decay: 2, sustain: 0.6, release: 8 },
      }),
  },
];

export const DEFAULT_PRESET_ID = PLAY_PRESETS[0]!.id;

export function findPreset(id: string): PlayPreset {
  return PLAY_PRESETS.find((p) => p.id === id) ?? PLAY_PRESETS[0]!;
}
