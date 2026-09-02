/**
 * The computer keyboard as a keybed.
 *
 * Play mode has to work with nothing plugged in — most people reading about
 * this will not have a controller to hand — so the standard tracker layout is
 * always live: the home row is the white keys, the row above it the black
 * ones, and Z / X shift octave.
 */

/** Physical key codes, so the layout holds on a non-QWERTY keyboard. */
const LAYOUT: Record<string, number> = {
  KeyA: 0, // C
  KeyW: 1,
  KeyS: 2, // D
  KeyE: 3,
  KeyD: 4, // E
  KeyF: 5, // F
  KeyT: 6,
  KeyG: 7, // G
  KeyY: 8,
  KeyH: 9, // A
  KeyU: 10,
  KeyJ: 11, // B
  KeyK: 12, // C
  KeyO: 13,
  KeyL: 14, // D
  KeyP: 15,
  Semicolon: 16, // E
};

/** Middle C sits under A — the same reference the scale mapping uses. */
const BASE_MIDI = 60;

export interface KeyboardHandlers {
  noteOn(midiNote: number, velocity: number): void;
  noteOff(midiNote: number): void;
  octaveShift(delta: number): void;
}

export class KeyboardInput {
  private readonly down = new Set<string>();
  private enabled = false;
  private readonly onKeyDown = (e: KeyboardEvent) => this.handleDown(e);
  private readonly onKeyUp = (e: KeyboardEvent) => this.handleUp(e);
  private readonly onBlur = () => this.releaseAll();

  constructor(private readonly handlers: KeyboardHandlers) {}

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled) {
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      // Alt-tabbing away with a chord down would otherwise leave it sounding
      // forever — the key-up lands in another window.
      window.addEventListener('blur', this.onBlur);
    } else {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('blur', this.onBlur);
      this.releaseAll();
    }
  }

  /** The MIDI note a key code plays, or null. Drives the on-screen keyboard. */
  static noteForCode(code: string): number | null {
    const offset = LAYOUT[code];
    return offset === undefined ? null : BASE_MIDI + offset;
  }

  private handleDown(e: KeyboardEvent): void {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTypingTarget(e.target)) return;

    if (e.code === 'KeyZ' || e.code === 'KeyX') {
      e.preventDefault();
      this.handlers.octaveShift(e.code === 'KeyX' ? 1 : -1);
      return;
    }

    const note = KeyboardInput.noteForCode(e.code);
    if (note === null) return;
    e.preventDefault();
    if (this.down.has(e.code)) return;
    this.down.add(e.code);
    // No velocity sensor under a laptop key — pick a value that sits where a
    // moderate press would, so switching to hardware isn't a level jump.
    this.handlers.noteOn(note, 0.7);
  }

  private handleUp(e: KeyboardEvent): void {
    const note = KeyboardInput.noteForCode(e.code);
    if (note === null || !this.down.has(e.code)) return;
    this.down.delete(e.code);
    this.handlers.noteOff(note);
  }

  private releaseAll(): void {
    for (const code of [...this.down]) {
      const note = KeyboardInput.noteForCode(code);
      if (note !== null) this.handlers.noteOff(note);
    }
    this.down.clear();
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA'
  );
}
