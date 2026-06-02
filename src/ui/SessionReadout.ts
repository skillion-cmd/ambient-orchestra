import type { HarmonicContext } from '../audio/types';
import { PHASE_LABELS } from '../audio/Movement';

export interface MovementReadoutState {
  harmonic: HarmonicContext;
  harmonicTransitioning: boolean;
  harmonicTransitionProgress: number;
  pendingMovementSkip: boolean;
}

/** Audio-side session readout — movement, phase, progress. Lives in the left rail. */
export class SessionReadout {
  readonly element: HTMLElement;
  private readonly movIndexEl: HTMLElement;
  private readonly phaseBtn: HTMLButtonElement;
  private readonly movFill: HTMLElement;
  private readonly movMeta: HTMLElement;
  private readonly subEl: HTMLElement;

  constructor(
    private readonly onNextPhase: () => void,
    private readonly onNextMovement: () => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'session-readout';

    const movRow = this.buildRow();
    this.movIndexEl = movRow.tag;
    this.phaseBtn = movRow.action;
    this.phaseBtn.classList.add('readout-action--primary');
    this.phaseBtn.title = 'Next phase · shift-click for next movement';
    this.phaseBtn.addEventListener('click', (e) => {
      if (e.shiftKey) this.onNextMovement();
      else this.onNextPhase();
    });
    this.movFill = movRow.fill;
    this.movMeta = movRow.meta;

    this.subEl = document.createElement('div');
    this.subEl.className = 'readout-sub';

    this.element.append(movRow.row, this.subEl);
  }

  update(movement: MovementReadoutState): void {
    const { harmonic, harmonicTransitioning, harmonicTransitionProgress, pendingMovementSkip } =
      movement;
    const movPct = Math.round(harmonic.movementProgress * 100);

    this.movIndexEl.textContent = `M${String(harmonic.movementIndex + 1).padStart(2, '0')}`;
    this.phaseBtn.textContent = PHASE_LABELS[harmonic.movementPhase];
    this.movFill.style.width = `${movPct}%`;
    this.movMeta.textContent = `${movPct}%`;

    const busy = pendingMovementSkip || harmonicTransitioning;
    this.phaseBtn.disabled = busy;

    if (pendingMovementSkip) {
      this.subEl.textContent = 'dissolving';
    } else if (harmonicTransitioning) {
      this.subEl.textContent = `crossfade ${Math.round(harmonicTransitionProgress * 100)}%`;
    } else {
      this.subEl.textContent = '';
    }
  }

  private buildRow(): {
    row: HTMLElement;
    tag: HTMLElement;
    action: HTMLButtonElement;
    fill: HTMLElement;
    meta: HTMLElement;
  } {
    const row = document.createElement('div');
    row.className = 'readout-row';

    const tag = document.createElement('span');
    tag.className = 'readout-tag';
    tag.textContent = 'Mov';

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'readout-action';

    const track = document.createElement('div');
    track.className = 'readout-track';
    track.setAttribute('role', 'progressbar');

    const fill = document.createElement('div');
    fill.className = 'readout-fill';
    track.appendChild(fill);

    const meta = document.createElement('span');
    meta.className = 'readout-meta';

    row.append(tag, action, track, meta);
    return { row, tag, action, fill, meta };
  }
}
