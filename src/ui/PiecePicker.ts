import type { MovementCharacter, MovementScale } from '../audio/types';
import type { PieceRequest } from '../audio/HarmonicField';

const SCALES: { scale: MovementScale; label: string }[] = [
  { scale: 'fragment', label: 'Frag' },
  { scale: 'short', label: 'Short' },
  { scale: 'standard', label: 'Std' },
  { scale: 'long', label: 'Long' },
  { scale: 'epic', label: 'Epic' },
];

const CHARACTERS: { character: MovementCharacter; label: string }[] = [
  { character: 'open', label: 'Open' },
  { character: 'night', label: 'Night' },
];

/**
 * Calibrate-only piece picker.
 *
 * Drift is meant to be unpredictable, so this lives only in Calibrate,
 * where the whole point is direct control. Pick a length and a world and
 * the chosen piece starts now — otherwise reaching, say, a night epic
 * means waiting for two independent weighted draws to agree.
 *
 * A fragment never carries a night character (there is no room to
 * establish a groove and leave), so that pairing disables itself rather
 * than silently handing back an open piece.
 */
export class PiecePicker {
  readonly element: HTMLElement;
  private scale: MovementScale = 'standard';
  private character: MovementCharacter = 'open';
  private readonly scaleButtons = new Map<MovementScale, HTMLButtonElement>();
  private readonly characterButtons = new Map<MovementCharacter, HTMLButtonElement>();

  constructor(private readonly onPlay: (request: PieceRequest) => void) {
    this.element = document.createElement('div');
    this.element.className = 'piece-picker';

    const label = document.createElement('div');
    label.className = 'piece-picker-label';
    label.textContent = 'Play a piece';

    const scaleRow = document.createElement('div');
    scaleRow.className = 'piece-picker-row';
    for (const { scale, label: text } of SCALES) {
      const btn = this.button(text, () => {
        this.scale = scale;
        this.sync();
      });
      this.scaleButtons.set(scale, btn);
      scaleRow.appendChild(btn);
    }

    const charRow = document.createElement('div');
    charRow.className = 'piece-picker-row';
    for (const { character, label: text } of CHARACTERS) {
      const btn = this.button(text, () => {
        this.character = character;
        this.sync();
      });
      this.characterButtons.set(character, btn);
      charRow.appendChild(btn);
    }

    const play = this.button('Play', () =>
      this.onPlay({ scale: this.scale, character: this.character }),
    );
    play.classList.add('piece-picker-play');
    charRow.appendChild(play);

    this.element.append(label, scaleRow, charRow);
    this.sync();
  }

  private button(text: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'piece-picker-btn';
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private sync(): void {
    // A fragment can't be a night piece; fall back rather than mislead.
    const nightAllowed = this.scale !== 'fragment';
    if (!nightAllowed) this.character = 'open';

    for (const [scale, btn] of this.scaleButtons) {
      btn.classList.toggle('is-active', scale === this.scale);
    }
    for (const [character, btn] of this.characterButtons) {
      btn.classList.toggle('is-active', character === this.character);
      const blocked = character === 'night' && !nightAllowed;
      btn.disabled = blocked;
      btn.title = blocked ? 'A fragment is too short to establish a groove' : '';
    }
  }
}
