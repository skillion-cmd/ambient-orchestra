import type { HarmonicContext } from '../audio/types';
import { PLAY_BLENDS, type PlayBlendId } from '../audio/PlayBlend';
import type { PlayTuning } from '../audio/PlayMapping';
import { isBlackKey, midiToNoteName } from '../audio/PlayMapping';
import { PLAY_PRESETS } from '../audio/PlayPresets';
import { GESTURE_LABELS, GESTURE_ORDER, KNOB_ORDER } from '../input/MidiMap';
import type { MidiStatus } from '../input/MidiInput';

export interface PlayPanelState {
  presetId: string;
  tuning: PlayTuning;
  octaveShift: number;
  blend: PlayBlendId;
}

export interface PlayPanelHandlers {
  onPreset(id: string): void;
  onTuning(tuning: PlayTuning): void;
  onOctave(shift: number): void;
  /** How far forward the instrument sits against the orchestra. */
  onBlend(blend: PlayBlendId): void;
  /** A click or touch on the on-screen keyboard. */
  onNoteOn(midiNote: number, velocity: number): void;
  onNoteOff(midiNote: number): void;
  /** Arm learn for a knob slot (`knob:N`) or pad slot (`pad:N`); null cancels. */
  onLearn(target: string | null): void;
  onConnectMidi(): void;
}

/** Two octaves from middle C — the span the computer keyboard covers. */
const KEYBOARD_LOW = 60;
const KEYBOARD_HIGH = 84;

/**
 * The left-rail panel for Play mode.
 *
 * Mode-gated in CSS the same way the piece picker is, and built from plain
 * DOM like the rest of the rails. Everything it shows is either a control or
 * a piece of state you need while playing — what is connected, what voice is
 * under your hands, what key the field has drifted to, and whether the
 * orchestra is currently behind you.
 */
export class PlayPanel {
  readonly element: HTMLElement;
  private readonly deviceLine: HTMLElement;
  private readonly keyLine: HTMLElement;
  private readonly noteLine: HTMLElement;
  private readonly followLine: HTMLElement;
  private readonly connectButton: HTMLButtonElement;
  private readonly presetButtons = new Map<string, HTMLButtonElement>();
  private readonly tuningButtons = new Map<PlayTuning, HTMLButtonElement>();
  private readonly blendButtons = new Map<PlayBlendId, HTMLButtonElement>();
  private readonly octaveValue: HTMLElement;
  private readonly keyElements = new Map<number, HTMLElement>();
  private readonly learnButtons = new Map<string, HTMLButtonElement>();
  private state: PlayPanelState;
  private learning: string | null = null;
  private lastKeyLine = '';
  private lastNoteLine = '';
  private lastFollowLine = '';

  constructor(
    initial: PlayPanelState,
    private readonly handlers: PlayPanelHandlers,
  ) {
    this.state = { ...initial };
    this.element = document.createElement('div');
    this.element.className = 'play-panel';
    // The document-level double-click toggles the rails; playing two notes
    // quickly on the on-screen keyboard must not hide the panel underneath
    // the hand that is using it.
    this.element.addEventListener('dblclick', (e) => e.stopPropagation());

    this.element.appendChild(label('Instrument'));

    this.deviceLine = document.createElement('div');
    this.deviceLine.className = 'play-device';
    this.element.appendChild(this.deviceLine);

    this.connectButton = document.createElement('button');
    this.connectButton.type = 'button';
    this.connectButton.className = 'play-connect';
    this.connectButton.textContent = 'Connect a controller';
    this.connectButton.addEventListener('click', () => this.handlers.onConnectMidi());
    this.element.appendChild(this.connectButton);

    this.element.appendChild(this.buildPresetRows());
    this.element.appendChild(this.buildTuningRow());

    this.keyLine = document.createElement('div');
    this.keyLine.className = 'play-key';
    this.element.appendChild(this.keyLine);

    // What is sounding sits high in the panel, next to the key it is sounding
    // in. It is the one line you glance at mid-phrase, so it must not be the
    // thing that scrolls out of the rail when the panel runs long.
    this.noteLine = document.createElement('div');
    this.noteLine.className = 'play-notes';
    this.element.appendChild(this.noteLine);

    // Directly under what you are playing, because it is the answer to it.
    this.followLine = document.createElement('div');
    this.followLine.className = 'play-follow';
    this.element.appendChild(this.followLine);

    this.octaveValue = document.createElement('span');
    this.element.appendChild(this.buildOctaveRow());
    this.element.appendChild(this.buildBlendRow());
    this.element.appendChild(this.buildKeyboard());
    this.element.appendChild(this.buildLearnSection());

    this.syncPresets();
    this.syncTuning();
    this.syncOctave();
    this.syncBlend();
  }

  getState(): PlayPanelState {
    return { ...this.state };
  }

  setStatus(status: MidiStatus, deviceName: string | null): void {
    const text =
      status === 'connected' && deviceName
        ? deviceName
        : status === 'connected'
          ? 'MIDI controller'
          : status === 'no-device'
            ? 'no controller — use the computer keyboard'
            : status === 'denied'
              ? 'MIDI permission refused — use the computer keyboard'
              : status === 'unsupported'
                ? 'Web MIDI unavailable in this browser'
                : 'computer keyboard';
    this.deviceLine.textContent = text;
    this.deviceLine.classList.toggle('is-live', status === 'connected');
    this.connectButton.hidden = status === 'connected' || status === 'unsupported';
  }

  setPreset(id: string): void {
    this.state.presetId = id;
    this.syncPresets();
  }

  setTuning(tuning: PlayTuning): void {
    this.state.tuning = tuning;
    this.syncTuning();
  }

  setOctave(shift: number): void {
    this.state.octaveShift = shift;
    this.syncOctave();
  }

  setLearning(target: string | null): void {
    this.learning = target;
    for (const [key, button] of this.learnButtons) {
      button.classList.toggle('is-learning', key === target);
    }
  }

  /**
   * Called each frame — held keys, the live key signature, the duck state.
   *
   * `duckDepth` is 0–1 rather than a flag because the duck is proportional
   * now: the line should read as held back once the orchestra has actually
   * moved by something you can hear, not the instant the first key goes down.
   */
  update(
    harmonic: HarmonicContext,
    heldKeys: number[],
    soundingNotes: string[],
    duckDepth: number,
    follow: { confidence: number; taken: boolean },
  ): void {
    const ducked = duckDepth > 0.05;
    const held = new Set(heldKeys);
    for (const [note, element] of this.keyElements) {
      element.classList.toggle('is-held', held.has(note));
    }

    const keyText =
      this.state.tuning === 'scale'
        ? `${harmonic.root} ${harmonic.mode} — keys follow the field`
        : `${harmonic.root} ${harmonic.mode} — chromatic`;
    if (keyText !== this.lastKeyLine) {
      this.keyLine.textContent = keyText;
      this.lastKeyLine = keyText;
    }

    const sounding = soundingNotes.length
      ? soundingNotes.join(' ')
      : ducked
        ? 'orchestra held back'
        : '—';
    if (sounding !== this.lastNoteLine) {
      this.noteLine.textContent = sounding;
      this.lastNoteLine = sounding;
    }
    this.noteLine.classList.toggle('is-ducked', ducked);
    this.renderFollow(follow);
  }

  /**
   * Say where the chord you are holding has got to.
   *
   * Three states, and they are the three the loop actually has: nothing being
   * asked for, a shape settling into one, and the ensemble having taken it.
   * The middle one matters most — it is the beat where you are holding a chord
   * and the orchestra has not moved yet, which without a word on screen reads
   * as the feature being broken rather than as the ensemble waiting for its
   * bar.
   */
  private renderFollow(follow: { confidence: number; taken: boolean }): void {
    const text = follow.taken
      ? 'ensemble took your chord'
      : follow.confidence >= 0.999
        ? 'holding — waiting for the bar'
        : follow.confidence > 0
          ? 'ensemble listening'
          : '';
    if (text !== this.lastFollowLine) {
      this.followLine.textContent = text;
      this.lastFollowLine = text;
    }
    this.followLine.classList.toggle('is-taken', follow.taken);
  }

  private buildPresetRows(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'play-presets';
    for (const preset of PLAY_PRESETS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = preset.label;
      button.title = `a playable ${preset.origin}`;
      button.addEventListener('click', () => {
        this.state.presetId = preset.id;
        this.syncPresets();
        this.handlers.onPreset(preset.id);
      });
      this.presetButtons.set(preset.id, button);
      wrap.appendChild(button);
    }
    return wrap;
  }

  private buildTuningRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'play-row';
    for (const tuning of ['scale', 'chromatic'] as PlayTuning[]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tuning === 'scale' ? 'In key' : 'Chromatic';
      button.addEventListener('click', () => {
        this.state.tuning = tuning;
        this.syncTuning();
        this.handlers.onTuning(tuning);
      });
      this.tuningButtons.set(tuning, button);
      row.appendChild(button);
    }
    return row;
  }

  /**
   * Where the instrument sits in the mix.
   *
   * The one control the first version was missing, and the reason it could
   * only ever be too loud or too quiet for a given listener: how far forward
   * your hands sit against an orchestra that is still composing is a taste
   * decision, not a constant. Each choice moves the instrument's own level
   * and how far the ensemble leans away from it together, because those are
   * the same decision made twice.
   */
  private buildBlendRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'play-row play-blend';
    for (const blend of PLAY_BLENDS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = blend.label;
      button.title = blend.hint;
      button.addEventListener('click', () => {
        this.state.blend = blend.id;
        this.syncBlend();
        this.handlers.onBlend(blend.id);
      });
      this.blendButtons.set(blend.id, button);
      row.appendChild(button);
    }
    return row;
  }

  private syncBlend(): void {
    for (const [id, button] of this.blendButtons) {
      button.classList.toggle('is-active', id === this.state.blend);
    }
  }

  private buildOctaveRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'play-row play-octave';

    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = '−';
    down.addEventListener('click', () => this.nudgeOctave(-1));

    const up = document.createElement('button');
    up.type = 'button';
    up.textContent = '+';
    up.addEventListener('click', () => this.nudgeOctave(1));

    this.octaveValue.className = 'play-octave-value';
    row.append(down, this.octaveValue, up);
    return row;
  }

  private nudgeOctave(delta: number): void {
    const next = Math.max(-3, Math.min(3, this.state.octaveShift + delta));
    if (next === this.state.octaveShift) return;
    this.state.octaveShift = next;
    this.syncOctave();
    this.handlers.onOctave(next);
  }

  /**
   * Two octaves of clickable keys, so Play works with nothing plugged in.
   *
   * White keys share the width in a flex row; black keys are positioned
   * absolutely over the boundaries between them, at a percentage derived from
   * how many white keys precede each one. Overlaying them inline with negative
   * margins instead — the obvious first try — drifts, because a black key's
   * own box still takes part in the flex distribution and each one nudges
   * every key after it out of true.
   */
  private buildKeyboard(): HTMLElement {
    const keyboard = document.createElement('div');
    keyboard.className = 'play-keyboard';
    keyboard.setAttribute('role', 'group');
    keyboard.setAttribute('aria-label', 'On-screen keyboard');

    const whites = document.createElement('div');
    whites.className = 'play-keyboard-whites';
    keyboard.appendChild(whites);

    let whiteCount = 0;
    for (let note = KEYBOARD_LOW; note <= KEYBOARD_HIGH; note++) {
      if (!isBlackKey(note)) whiteCount++;
    }
    const whiteWidth = 100 / whiteCount;

    let placed = 0;
    for (let note = KEYBOARD_LOW; note <= KEYBOARD_HIGH; note++) {
      const black = isBlackKey(note);
      const key = document.createElement('button');
      key.type = 'button';
      key.className = black ? 'play-key-cap is-black' : 'play-key-cap';
      key.setAttribute('aria-label', midiToNoteName(note));

      if (black) {
        // Straddle the boundary after every white key already placed.
        key.style.left = `${placed * whiteWidth}%`;
        keyboard.appendChild(key);
      } else {
        whites.appendChild(key);
        placed++;
      }

      this.bindKey(key, note);
      this.keyElements.set(note, key);
    }
    return keyboard;
  }

  private bindKey(key: HTMLElement, note: number): void {
    // Pointer capture keeps the note-off arriving even if the cursor slides
    // off the key mid-press — a mouse is a clumsy finger.
    key.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      key.setPointerCapture(e.pointerId);
      this.handlers.onNoteOn(note, 0.75);
    });
    const release = () => this.handlers.onNoteOff(note);
    key.addEventListener('pointerup', release);
    key.addEventListener('pointercancel', release);
  }

  private buildLearnSection(): HTMLElement {
    const details = document.createElement('details');
    details.className = 'play-learn';

    const summary = document.createElement('summary');
    summary.textContent = 'MIDI learn';
    details.appendChild(summary);

    const note = document.createElement('div');
    note.className = 'play-learn-note';
    note.textContent =
      'Factory mappings differ between units. Arm a slot, then move the control.';
    details.appendChild(note);

    details.appendChild(this.buildLearnRow('knob', KNOB_ORDER.map(titleCase)));
    details.appendChild(
      this.buildLearnRow('pad', [
        ...PLAY_PRESETS.map((p) => p.label),
        ...GESTURE_ORDER.map((g) => GESTURE_LABELS[g]),
      ]),
    );
    return details;
  }

  private buildLearnRow(kind: 'knob' | 'pad', labels: string[]): HTMLElement {
    const row = document.createElement('div');
    row.className = 'play-learn-row';
    labels.forEach((text, index) => {
      const key = `${kind}:${index}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.addEventListener('click', () => {
        const next = this.learning === key ? null : key;
        this.setLearning(next);
        this.handlers.onLearn(next);
      });
      this.learnButtons.set(key, button);
      row.appendChild(button);
    });
    return row;
  }

  private syncPresets(): void {
    for (const [id, button] of this.presetButtons) {
      const active = id === this.state.presetId;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  private syncTuning(): void {
    for (const [tuning, button] of this.tuningButtons) {
      const active = tuning === this.state.tuning;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  private syncOctave(): void {
    const shift = this.state.octaveShift;
    this.octaveValue.textContent = shift === 0 ? 'Octave 0' : `Octave ${shift > 0 ? '+' : ''}${shift}`;
  }
}

function label(text: string): HTMLElement {
  const element = document.createElement('div');
  element.className = 'play-panel-label';
  element.textContent = text;
  return element;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
