import type { AudioEngine } from '../audio/AudioEngine';
import type { PlayInstrument } from '../audio/PlayInstrument';
import type { PlayTuning } from '../audio/PlayMapping';
import { findPreset, PLAY_PRESETS } from '../audio/PlayPresets';
import type { SoundKnobs } from '../audio/types';
import type { Controls } from '../ui/Controls';
import { KeyboardInput } from './KeyboardInput';
import { MidiInput, type MidiStatus } from './MidiInput';
import {
  GESTURE_ORDER,
  GENERIC_PROFILE,
  isPadNote,
  knobIndexForCC,
  KNOB_ORDER,
  learnCC,
  learnPad,
  loadLearnedMap,
  padSlotForNote,
  profileForDevice,
  storeLearnedMap,
  type DeviceProfile,
  type GestureId,
  type LearnedMap,
} from './MidiMap';

const SUSTAIN_CC = 64;
const MOD_CC = 1;
/** How close a hardware pot must come before it takes the software knob. */
const TAKEOVER_WINDOW = 0.03;

export interface PlayControllerHooks {
  onStatus(status: MidiStatus, deviceName: string | null): void;
  onPreset(id: string): void;
  onOctave(shift: number): void;
  /** A learn binding landed — the panel disarms its armed slot. */
  onLearned(): void;
  /** Visual gestures the engine doesn't own. */
  onNextForm(): void;
}

/**
 * Everything between an input device and the instrument.
 *
 * Keys and pads both arrive as note-ons, so the first job is telling them
 * apart — that is the device profile's business, and it is why an unknown
 * controller still plays even when its pads land somewhere unexpected.
 */
export class PlayController {
  private readonly midi: MidiInput;
  private readonly keyboard: KeyboardInput;
  private readonly instrument: PlayInstrument;
  private profile: DeviceProfile = GENERIC_PROFILE;
  private learned: LearnedMap = loadLearnedMap();
  private learning: string | null = null;
  private active = false;
  /**
   * Which pots have caught up with their software knob.
   *
   * Hardware pots are absolute: the pot is wherever it was left, the software
   * knob is wherever the automator drifted it, and a bare CC write would snap
   * the knob across its range on the first touch. So a pot stays inert until
   * it passes through the current value, and picks it up from there.
   */
  private readonly takenOver = new Set<number>();

  constructor(
    private readonly engine: AudioEngine,
    private readonly controls: Controls,
    private readonly hooks: PlayControllerHooks,
  ) {
    this.instrument = engine.getPlayInstrument();
    this.midi = new MidiInput({
      noteOn: (e) => this.handleNoteOn(e.note, e.velocity, e.channel),
      noteOff: (e) => this.handleNoteOff(e.note, e.channel),
      controlChange: (e) => this.handleControlChange(e.cc, e.value, e.raw),
      pitchBend: (value) => this.instrument.setBend(value),
      statusChange: (status, name) => {
        this.profile = profileForDevice(name);
        this.takenOver.clear();
        // A controller unplugged mid-chord never sends its note-offs.
        if (status !== 'connected') this.instrument.allNotesOff();
        this.hooks.onStatus(status, name);
      },
    });
    this.keyboard = new KeyboardInput({
      noteOn: (note, velocity) => this.instrument.noteOn(note, velocity),
      noteOff: (note) => this.instrument.noteOff(note),
      octaveShift: (delta) => this.nudgeOctave(delta),
    });
  }

  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.keyboard.setEnabled(active);
    if (!active) this.setLearning(null);
  }

  /** Ask for MIDI access. Must be called from a user gesture. */
  async connect(): Promise<void> {
    await this.midi.connect();
  }

  getStatus(): MidiStatus {
    return this.midi.getStatus();
  }

  getDeviceName(): string | null {
    return this.midi.getDeviceName();
  }

  /** Arm a learn slot (`knob:N` / `pad:N`), or null to disarm. */
  setLearning(target: string | null): void {
    this.learning = target;
  }

  /** On-screen keyboard and any other in-app source. */
  noteOn(midiNote: number, velocity: number): void {
    this.instrument.noteOn(midiNote, velocity);
  }

  noteOff(midiNote: number): void {
    this.instrument.noteOff(midiNote);
  }

  setTuning(tuning: PlayTuning): void {
    this.instrument.setTuning(tuning);
  }

  setOctave(shift: number): void {
    this.instrument.setOctaveShift(shift);
  }

  setPreset(id: string): void {
    this.instrument.setPreset(id);
  }

  dispose(): void {
    this.keyboard.setEnabled(false);
    this.midi.dispose();
  }

  private handleNoteOn(note: number, velocity: number, channel: number): void {
    if (!this.active) return;
    const pad = isPadNote(this.profile, note, channel);

    if (this.learning) {
      // Only a pad slot can be taught from a note — arming a knob and then
      // hitting a pad should play the pad, not silently bind nothing.
      if (this.learning.startsWith('pad:') && pad) {
        this.commitLearn(learnPad(this.learned, note, slotOf(this.learning)));
        return;
      }
      if (this.learning.startsWith('pad:')) return;
    }

    if (pad) {
      this.firePad(padSlotForNote(this.profile, this.learned, note, channel));
      return;
    }
    this.instrument.noteOn(note, velocity);
  }

  private handleNoteOff(note: number, channel: number): void {
    if (!this.active) return;
    if (isPadNote(this.profile, note, channel)) return;
    this.instrument.noteOff(note);
  }

  private handleControlChange(cc: number, value: number, raw: number): void {
    if (!this.active) return;

    if (this.learning?.startsWith('knob:')) {
      this.commitLearn(learnCC(this.learned, cc, slotOf(this.learning)));
      return;
    }

    if (cc === SUSTAIN_CC) {
      this.instrument.setSustain(raw >= 64);
      return;
    }
    if (cc === MOD_CC) {
      this.instrument.setModulation(value);
      return;
    }

    const index = knobIndexForCC(this.profile, this.learned, cc);
    const key = KNOB_ORDER[index];
    if (index < 0 || !key) return;
    this.applyHardwareKnob(cc, key, value);
  }

  /** Soft takeover — see `takenOver`. */
  private applyHardwareKnob(cc: number, key: keyof SoundKnobs, value: number): void {
    if (!this.takenOver.has(cc)) {
      if (Math.abs(value - this.controls.getSoundKnob(key)) > TAKEOVER_WINDOW) return;
      this.takenOver.add(cc);
    }
    this.controls.setSoundKnob(key, value);
  }

  private commitLearn(map: LearnedMap): void {
    this.learned = map;
    storeLearnedMap(map);
    // A re-taught pot has to earn its knob back through takeover, or it would
    // snap the value the instant it is bound.
    this.takenOver.clear();
    this.learning = null;
    this.hooks.onLearned();
  }

  /** Bank A picks a preset, bank B fires a gesture. */
  private firePad(slot: number): void {
    if (slot < 0) return;
    if (slot < PLAY_PRESETS.length) {
      const preset = PLAY_PRESETS[slot]!;
      this.instrument.setPreset(preset.id);
      this.hooks.onPreset(preset.id);
      return;
    }
    const gesture = GESTURE_ORDER[slot - PLAY_PRESETS.length];
    if (gesture) this.fireGesture(gesture);
  }

  private fireGesture(gesture: GestureId): void {
    switch (gesture) {
      case 'nextPhase':
        this.engine.requestNextPhase();
        break;
      case 'nextMovement':
        this.engine.requestNextMovement();
        break;
      case 'spaceThrow':
        this.engine.triggerSpaceThrow();
        break;
      case 'inhale':
        this.engine.triggerPreEnsembleInhale();
        break;
      case 'vacuum':
        this.engine.triggerExhaleVacuum();
        break;
      case 'thinMix':
        this.engine.triggerThinMix();
        break;
      case 'nextForm':
        this.hooks.onNextForm();
        break;
      case 'panic':
        this.instrument.allNotesOff();
        break;
    }
  }

  private nudgeOctave(delta: number): void {
    const next = this.instrument.getOctaveShift() + delta;
    this.instrument.setOctaveShift(next);
    this.hooks.onOctave(this.instrument.getOctaveShift());
  }
}

function slotOf(target: string): number {
  return Number(target.split(':')[1] ?? -1);
}

/** Re-exported so main can seed the panel without reaching into presets. */
export { findPreset };
