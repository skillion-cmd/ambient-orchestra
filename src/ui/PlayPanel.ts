import type { HarmonicContext } from '../audio/types';
import { PLAY_BLENDS, type PlayBlendId, type PlayVoiceMode } from '../audio/PlayBlend';
import { KIT_LABELS, KIT_LAYOUT, kitPieceFor } from '../audio/PlayKit';
import type { PlayTuning } from '../audio/PlayMapping';
import { isBlackKey, isInScale, mapPlayNote, midiToNoteName } from '../audio/PlayMapping';
import { PLAY_PRESETS } from '../audio/PlayPresets';
import { GESTURE_LABELS, GESTURE_ORDER, KNOB_ORDER } from '../input/MidiMap';
import type { MidiStatus } from '../input/MidiInput';

export interface PlayPanelState {
  presetId: string;
  tuning: PlayTuning;
  octaveShift: number;
  blend: PlayBlendId;
  /** Melody or Beat — which half of the orchestra the keys play. */
  voiceMode: PlayVoiceMode;
}

export interface PlayPanelHandlers {
  onPreset(id: string): void;
  onTuning(tuning: PlayTuning): void;
  onOctave(shift: number): void;
  /** How far forward the instrument sits against the orchestra. */
  onBlend(blend: PlayBlendId): void;
  /** Swap the keybed between the voices and the kit. */
  onVoiceMode(mode: PlayVoiceMode): void;
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
 * One octave on a phone.
 *
 * Two octaves is fifteen white keys, which on a 390px screen is 24px each —
 * narrower than the finger aiming at them, so every chord is a gamble. One
 * octave is eight keys at about 44px, which is the width a thumb actually
 * hits, and the octave stepper right above already covers the rest of the
 * range. The computer keybed and any MIDI controller keep their full span
 * either way: this is what is *drawn*, not what can be played.
 */
const COMPACT_KEYBOARD_HIGH = 72;

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
  private readonly voiceModeButtons = new Map<PlayVoiceMode, HTMLButtonElement>();
  private presetRows!: HTMLElement;
  private tuningRow!: HTMLElement;
  private kitLegend!: HTMLElement;
  private readonly tuningButtons = new Map<PlayTuning, HTMLButtonElement>();
  private readonly blendButtons = new Map<PlayBlendId, HTMLButtonElement>();
  private readonly octaveValue: HTMLElement;
  private octaveRow!: HTMLElement;
  private keyboard!: HTMLElement;
  private compact = false;
  private readonly keyElements = new Map<number, HTMLElement>();
  private readonly learnButtons = new Map<string, HTMLButtonElement>();
  private state: PlayPanelState;
  private learning: string | null = null;
  private lastKeyLine = '';
  private lastNoteLine = '';
  private lastFollowLine = '';
  /** The live field, so the caps can say what they will sound. */
  private harmonic: HarmonicContext | null = null;
  /** Everything the caps depend on, so the relabel runs on change, not on frame. */
  private lastCapSignature = '';

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

    this.deviceLine = document.createElement('div');
    this.deviceLine.className = 'play-device';

    this.connectButton = document.createElement('button');
    this.connectButton.type = 'button';
    this.connectButton.className = 'play-connect';
    this.connectButton.textContent = 'Connect a controller';
    this.connectButton.addEventListener('click', () => this.handlers.onConnectMidi());

    // Who you are playing on, in one line across the top.
    const head = section('play-head');
    head.append(label('Instrument'), this.deviceLine, this.connectButton);

    // What you are playing with: the half of the orchestra, then the voice
    // within it, then how the keys are laid out.
    const voices = section('play-voices');
    this.presetRows = this.buildPresetRows();
    this.tuningRow = this.buildTuningRow();
    this.kitLegend = this.buildKitLegend();
    voices.append(
      this.buildVoiceModeRow(),
      this.presetRows,
      this.kitLegend,
      this.tuningRow,
    );

    this.octaveValue = document.createElement('span');
    const settings = section('play-settings');
    settings.append(this.buildOctaveRow(), this.buildBlendRow());

    this.keyLine = document.createElement('div');
    this.keyLine.className = 'play-key';

    // What is sounding is the one line you glance at mid-phrase, so it sits
    // directly above the keys rather than anywhere it has to be found.
    this.noteLine = document.createElement('div');
    this.noteLine.className = 'play-notes';

    // Directly under what you are playing, because it is the answer to it.
    this.followLine = document.createElement('div');
    this.followLine.className = 'play-follow';

    const readout = section('play-readout');
    readout.append(this.keyLine, this.noteLine, this.followLine);

    this.element.append(
      head,
      voices,
      settings,
      readout,
      this.buildKeyboard(),
      this.buildLearnSection(),
    );

    this.syncPresets();
    this.syncTuning();
    this.syncOctave();
    this.syncBlend();
    this.syncVoiceMode();
  }

  getState(): PlayPanelState {
    return { ...this.state };
  }

  /**
   * Redraw the keys for a phone-width stage, or back again.
   *
   * A rebuild rather than hiding the upper octave with CSS: the black keys
   * are positioned as a percentage of however many white keys are in the row,
   * so dropping seven whites out of the flex line would leave every sharp
   * sitting over the wrong boundary.
   */
  setCompact(compact: boolean): void {
    if (compact === this.compact) return;
    this.compact = compact;
    // `buildKeyboard` claims `this.keyboard` for the new row, so the old one
    // has to be held onto before the call to have something to swap out.
    const previous = this.keyboard;
    previous.replaceWith(this.buildKeyboard());
    // The fresh caps are blank — they have neither their kit labels nor their
    // pitches yet, and the signature still matches the row that just went.
    this.lastCapSignature = '';
    this.syncVoiceMode();
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

  setVoiceMode(mode: PlayVoiceMode): void {
    this.state.voiceMode = mode;
    this.syncVoiceMode();
  }

  setTuning(tuning: PlayTuning): void {
    this.state.tuning = tuning;
    this.syncTuning();
    this.syncKeyCaps();
  }

  setOctave(shift: number): void {
    this.state.octaveShift = shift;
    this.syncOctave();
    this.syncKeyCaps();
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

    this.harmonic = harmonic;
    this.syncKeyCaps();

    const keyText =
      this.state.voiceMode === 'beat'
        ? `${harmonic.root} ${harmonic.mode} — the kit is tuned to it`
        : this.state.tuning === 'scale'
          ? `${harmonic.root} ${harmonic.mode} — dimmed keys fall in`
          : `${harmonic.root} ${harmonic.mode} — every key sounds itself`;
    if (keyText !== this.lastKeyLine) {
      this.keyLine.textContent = keyText;
      this.lastKeyLine = keyText;
    }

    const sounding = soundingNotes.length
      ? soundingNotes.join(this.state.voiceMode === 'beat' ? ' · ' : ' ')
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

  /**
   * Melody or Beat.
   *
   * The first row in the panel, above the voices, because it decides what
   * every control under it means: in Beat the eight presets and the in-key
   * toggle have nothing to act on, and a row of live-looking buttons that
   * do nothing is worse than a row that isn't there.
   */
  private buildVoiceModeRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'play-row play-voice-mode';
    const modes: { mode: PlayVoiceMode; label: string; hint: string }[] = [
      { mode: 'melody', label: 'Melody', hint: 'the keys play the orchestra\u2019s voices' },
      { mode: 'beat', label: 'Beat', hint: 'the keys play the kit, one piece per key' },
    ];
    for (const { mode, label, hint } of modes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.title = hint;
      button.addEventListener('click', () => {
        if (this.state.voiceMode === mode) return;
        this.state.voiceMode = mode;
        this.syncVoiceMode();
        this.handlers.onVoiceMode(mode);
      });
      this.voiceModeButtons.set(mode, button);
      row.appendChild(button);
    }
    return row;
  }

  /**
   * The five pieces a key cap can't name for itself.
   *
   * The white caps carry their own labels in Beat mode, which leaves the
   * black ones — a quarter of the width, and no room for a word. Named by
   * pitch class rather than by which key on your particular keyboard,
   * because the layout repeats every octave and the same panel serves a
   * MIDI controller, a QWERTY keybed and the keys drawn underneath it. C is
   * the one thing all three agree on.
   */
  private buildKitLegend(): HTMLElement {
    const legend = document.createElement('div');
    legend.className = 'play-kit-legend';
    KIT_LAYOUT.forEach((id, semitone) => {
      if (!isBlackKey(60 + semitone)) return;
      const cell = document.createElement('span');
      cell.textContent = `${PITCH_CLASSES[semitone]} ${KIT_LABELS[id]}`;
      legend.appendChild(cell);
    });
    return legend;
  }

  private syncVoiceMode(): void {
    const beat = this.state.voiceMode === 'beat';
    for (const [mode, button] of this.voiceModeButtons) {
      const active = mode === this.state.voiceMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    this.presetRows.hidden = beat;
    this.tuningRow.hidden = beat;
    // The octave stepper transposes the melodic mapping; a drum is not
    // transposed, it is a different drum, so in Beat the row would be a
    // control that answers nothing.
    this.octaveRow.hidden = beat;
    this.kitLegend.hidden = !beat;
    this.element.classList.toggle('is-beat', beat);
    this.syncKeyCaps();
  }

  /**
   * Write on each cap what that key will actually do.
   *
   * In Beat that is a kit piece — a layout you learn by looking at it once,
   * and playing one from a legend above the keys means reading instead of
   * playing. In Melody it is a pitch, and it has to be the pitch that will
   * *sound*, not the one the key is drawn as. Those used to be different
   * things: scale tuning walked the white keys through the scale degrees, so
   * under a picture of a piano the B♭ key could sound a G. A drawn keyboard
   * is a promise about which note is under your finger, and it was being
   * broken silently — the one failure a player never debugs, because they
   * assume they misread their own hands.
   *
   * They agree now. The keys that fall outside the field's key are the only
   * ones left to explain, and they explain themselves: drawn recessed, and
   * in scale tuning captioned with the neighbour they resolve onto.
   */
  private syncKeyCaps(): void {
    const beat = this.state.voiceMode === 'beat';
    const ctx = this.harmonic;
    // Cheap enough to run per frame only because it almost never does any
    // work: the field's key changes on a movement, not on a frame.
    const signature = beat
      ? 'beat'
      : `${ctx?.rootMidi ?? '-'}|${ctx?.scale.join(',') ?? '-'}|${ctx?.root ?? '-'}` +
        `|${ctx?.mode ?? '-'}|${this.state.tuning}|${this.state.octaveShift}`;
    if (signature === this.lastCapSignature) return;
    this.lastCapSignature = signature;

    for (const [note, key] of this.keyElements) {
      if (beat) {
        const piece = KIT_LABELS[kitPieceFor(note)];
        key.setAttribute('aria-label', piece);
        key.title = piece;
        key.classList.remove('is-outside');
        if (!key.classList.contains('is-black')) key.textContent = piece;
        continue;
      }

      // The octave stepper transposes the whole keybed, so the key's own
      // identity moves with it — an on-screen C at Octave +1 is a C5.
      const drawn = midiToNoteName(note + this.state.octaveShift * 12);
      const sounded = ctx
        ? midiToNoteName(
            mapPlayNote(note, ctx, this.state.tuning, this.state.octaveShift),
          )
        : drawn;
      const outside = ctx ? !isInScale(note + this.state.octaveShift * 12, ctx) : false;

      key.classList.toggle('is-outside', outside);
      const caption = !outside
        ? drawn
        : sounded === drawn
          ? `${drawn} — outside ${ctx!.root} ${ctx!.mode}`
          : `${drawn} — outside ${ctx!.root} ${ctx!.mode}, sounds ${sounded}`;
      key.setAttribute('aria-label', caption);
      key.title = caption;
      // The cap itself carries the sounding pitch, so what is written on the
      // instrument is true even for the keys that resolve onto a neighbour.
      if (!key.classList.contains('is-black')) key.textContent = sounded;
    }
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
    row.className = 'play-row play-tuning';
    const hints: Record<PlayTuning, string> = {
      scale: 'keys outside the field’s key fall onto the nearest note inside it',
      chromatic: 'every key sounds its own pitch — staying in key is on you',
    };
    for (const tuning of ['scale', 'chromatic'] as PlayTuning[]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tuning === 'scale' ? 'In key' : 'Chromatic';
      button.title = hints[tuning];
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
    this.octaveRow = row;
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

    const high = this.compact ? COMPACT_KEYBOARD_HIGH : KEYBOARD_HIGH;
    let whiteCount = 0;
    for (let note = KEYBOARD_LOW; note <= high; note++) {
      if (!isBlackKey(note)) whiteCount++;
    }
    const whiteWidth = 100 / whiteCount;
    // A black key is about half a white one on a real keyboard, and the row
    // is a different number of whites wide in each layout.
    keyboard.style.setProperty('--black-key-width', `${whiteWidth * 0.56}%`);

    this.keyElements.clear();
    let placed = 0;
    for (let note = KEYBOARD_LOW; note <= high; note++) {
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
    this.keyboard = keyboard;
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

/** Pitch-class names for the kit legend, sharps to match the black caps. */
const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function section(className: string): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  return element;
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
