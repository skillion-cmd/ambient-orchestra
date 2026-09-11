import type { HarmonicContext } from '../audio/types';
import { PHASE_LABELS } from '../audio/Movement';

export interface MovementReadoutState {
  harmonic: HarmonicContext;
  harmonicTransitioning: boolean;
  harmonicTransitionProgress: number;
  pendingMovementSkip: boolean;
}

/** Seconds as m:ss. */
function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  return `${mins}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Audio-side session readout — movement, phase, progress.
 *
 * Split in two on purpose. `element` is the readout and contains nothing you
 * can press: where the piece has got to, and how far through it is. `controls`
 * is the pair of buttons that move it on. They used to be the same thing — the
 * phase name was a button, and shift-clicking it skipped the movement — which
 * meant the one visible control in the rail looked like a label, and the other
 * one was invisible and unreachable from a phone, which has no shift key.
 */
export class SessionReadout {
  readonly element: HTMLElement;
  readonly controls: HTMLElement;
  private readonly movIndexEl: HTMLElement;
  private readonly phaseEl: HTMLElement;
  private readonly movFill: HTMLElement;
  private readonly movMeta: HTMLElement;
  private readonly subEl: HTMLElement;
  private readonly phaseBtn: HTMLButtonElement;
  private readonly movementBtn: HTMLButtonElement;

  constructor(
    private readonly onNextPhase: () => void,
    private readonly onNextMovement: () => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'session-readout';

    const movRow = this.buildRow();
    this.movIndexEl = movRow.tag;
    this.phaseEl = movRow.value;
    this.movFill = movRow.fill;
    this.movMeta = movRow.meta;

    this.subEl = document.createElement('div');
    this.subEl.className = 'readout-sub';

    this.element.append(movRow.row, this.subEl);

    this.controls = document.createElement('div');
    this.controls.className = 'readout-actions';
    this.phaseBtn = actionButton('Next phase', 'Move the piece on to its next phase', () =>
      this.onNextPhase(),
    );
    this.movementBtn = actionButton('Next movement', 'Dissolve this piece and begin another', () =>
      this.onNextMovement(),
    );
    this.controls.append(this.phaseBtn, this.movementBtn);
  }

  update(movement: MovementReadoutState): void {
    const { harmonic, harmonicTransitioning, harmonicTransitionProgress, pendingMovementSkip } =
      movement;
    const movPct = Math.round(harmonic.movementProgress * 100);

    this.movIndexEl.textContent = `M${String(harmonic.movementIndex + 1).padStart(2, '0')}`;
    this.phaseEl.textContent = PHASE_LABELS[harmonic.movementPhase];
    this.movFill.style.width = `${movPct}%`;
    // Movements now run anywhere from 45 seconds to nearly half an hour, so
    // a bare percentage says nothing about what kind of piece you're in.
    this.movMeta.textContent = `${clock(harmonic.movementElapsedSec)}/${clock(
      harmonic.movementDurationSec,
    )}`;

    const busy = pendingMovementSkip || harmonicTransitioning;
    this.phaseBtn.disabled = busy;
    this.movementBtn.disabled = busy;

    if (pendingMovementSkip) {
      this.subEl.textContent = 'dissolving';
    } else if (harmonicTransitioning) {
      this.subEl.textContent = `crossfade ${Math.round(harmonicTransitionProgress * 100)}%`;
    } else if (harmonic.roomCorridor > 0.3) {
      this.subEl.textContent = 'between rooms';
    } else if (harmonic.character === 'night') {
      this.subEl.textContent = `${harmonic.movementScale} · night`;
    } else {
      this.subEl.textContent = harmonic.movementScale;
    }
  }

  private buildRow(): {
    row: HTMLElement;
    tag: HTMLElement;
    value: HTMLElement;
    fill: HTMLElement;
    meta: HTMLElement;
  } {
    const row = document.createElement('div');
    row.className = 'readout-row';

    const tag = document.createElement('span');
    tag.className = 'readout-tag';
    tag.textContent = 'Mov';

    const value = document.createElement('span');
    value.className = 'readout-value';

    const track = document.createElement('div');
    track.className = 'readout-track';
    track.setAttribute('role', 'progressbar');

    const fill = document.createElement('div');
    fill.className = 'readout-fill';
    track.appendChild(fill);

    const meta = document.createElement('span');
    meta.className = 'readout-meta';

    row.append(tag, value, track, meta);
    return { row, tag, value, fill, meta };
  }
}

function actionButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'readout-action';
  button.textContent = label;
  button.title = title;
  button.addEventListener('click', onClick);
  return button;
}
