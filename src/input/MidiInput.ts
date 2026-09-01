/**
 * Web MIDI, reduced to the handful of messages an instrument cares about.
 *
 * Deliberately knows nothing about what any control *means* — that is
 * MidiMap's job, and keeping the two apart is what lets the same events feed
 * a learn mode as feed normal playing.
 */

export type MidiStatus =
  | 'idle'
  | 'unsupported'
  | 'denied'
  | 'no-device'
  | 'connected';

export interface MidiNoteEvent {
  /** 1-based, the way hardware documentation numbers channels. */
  channel: number;
  note: number;
  /** 0–1. */
  velocity: number;
}

export interface MidiControlEvent {
  channel: number;
  cc: number;
  /** 0–1. */
  value: number;
  /** Raw 0–127, for learn and for switch-style controls. */
  raw: number;
}

export interface MidiHandlers {
  noteOn(event: MidiNoteEvent): void;
  noteOff(event: MidiNoteEvent): void;
  controlChange(event: MidiControlEvent): void;
  /** -1..1 */
  pitchBend(value: number, channel: number): void;
  statusChange(status: MidiStatus, deviceName: string | null): void;
}

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const PITCH_BEND = 0xe0;

export class MidiInput {
  private access: MIDIAccess | null = null;
  private status: MidiStatus = 'idle';
  private deviceName: string | null = null;
  private readonly bound = new Set<MIDIInput>();

  constructor(private readonly handlers: MidiHandlers) {}

  getStatus(): MidiStatus {
    return this.status;
  }

  getDeviceName(): string | null {
    return this.deviceName;
  }

  /**
   * Ask for MIDI access.
   *
   * Call this from a user gesture — Web MIDI needs a secure context and
   * prompts for permission, and a prompt raised from a background timer is
   * one the browser may refuse outright. Every failure path here is
   * survivable: play mode falls back to the computer keyboard.
   */
  async connect(): Promise<MidiStatus> {
    if (this.access) return this.status;
    const requestAccess = navigator.requestMIDIAccess?.bind(navigator);
    if (!requestAccess) return this.setStatus('unsupported', null);

    try {
      this.access = await requestAccess({ sysex: false });
    } catch {
      return this.setStatus('denied', null);
    }

    this.access.onstatechange = () => this.rescan();
    this.rescan();
    return this.status;
  }

  dispose(): void {
    for (const input of this.bound) input.onmidimessage = null;
    this.bound.clear();
    if (this.access) this.access.onstatechange = null;
    this.access = null;
    this.setStatus('idle', null);
  }

  /** Attach to every input port, and re-report which device is in charge. */
  private rescan(): void {
    if (!this.access) return;
    let first: string | null = null;
    let count = 0;

    for (const input of this.access.inputs.values()) {
      count++;
      first ??= input.name ?? null;
      if (this.bound.has(input)) continue;
      input.onmidimessage = (event) => this.handleMessage(event);
      this.bound.add(input);
    }

    // A port that went away stops delivering on its own; drop the reference
    // so a replug rebinds rather than being skipped as already-bound.
    for (const input of [...this.bound]) {
      if (input.state === 'disconnected') {
        input.onmidimessage = null;
        this.bound.delete(input);
      }
    }

    this.setStatus(count > 0 ? 'connected' : 'no-device', count > 0 ? first : null);
  }

  private setStatus(status: MidiStatus, deviceName: string | null): MidiStatus {
    if (status === this.status && deviceName === this.deviceName) return status;
    this.status = status;
    this.deviceName = deviceName;
    this.handlers.statusChange(status, deviceName);
    return status;
  }

  private handleMessage(event: MIDIMessageEvent): void {
    const data = event.data;
    if (!data || data.length < 2) return;
    const command = data[0]! & 0xf0;
    const channel = (data[0]! & 0x0f) + 1;
    const a = data[1]!;
    const b = data[2] ?? 0;

    switch (command) {
      case NOTE_ON:
        // Note-on at zero velocity is how most hardware says note-off.
        if (b === 0) this.handlers.noteOff({ channel, note: a, velocity: 0 });
        else this.handlers.noteOn({ channel, note: a, velocity: b / 127 });
        break;
      case NOTE_OFF:
        this.handlers.noteOff({ channel, note: a, velocity: b / 127 });
        break;
      case CONTROL_CHANGE:
        this.handlers.controlChange({ channel, cc: a, value: b / 127, raw: b });
        break;
      case PITCH_BEND: {
        const value = ((b << 7) | a) - 8192;
        // The wheel's travel is asymmetric — 8191 up, 8192 down.
        this.handlers.pitchBend(value / (value < 0 ? 8192 : 8191), channel);
        break;
      }
      default:
        break;
    }
  }
}
