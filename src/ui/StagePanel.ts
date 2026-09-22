import {
  addCue,
  CUE_BAR_OPTIONS,
  CUE_PHASES,
  duplicateCue,
  estimateSeconds,
  LAYER_LABELS,
  moveCue,
  PHASE_LABELS,
  removeCue,
  totalBars,
  updateCue,
  type StageCue,
  type StagePerformance,
} from '../audio/Performance';
import { PRESENCE_LAYERS } from '../audio/LayerPresence';
import type { CuePosition } from '../audio/Performance';
import type { RunnerState } from '../audio/PerformanceRunner';
import type { MovementCharacter } from '../audio/types';

export interface StagePanelHandlers {
  /** The set was edited — remember it, and hand it to the engine if running. */
  onChange(performance: StagePerformance): void;
  onStart(performance: StagePerformance): void;
  onStop(): void;
}

const FRESH_OPTIONS: { value: MovementCharacter | null; label: string; hint: string }[] = [
  { value: null, label: 'As it is', hint: 'conduct the piece that is already running' },
  { value: 'open', label: 'Open', hint: 'start the set on a fresh open piece' },
  { value: 'night', label: 'Night', hint: 'start the set on a fresh night piece — garage tempo, minor' },
];

/**
 * The set list — Stage mode's whole surface.
 *
 * A column of cue cards you edit in place, and one button that runs them.
 * Everything in a card is a decision about a stretch of bars: what the
 * ensemble is doing, how long for, which layers are in the room, and whether
 * the built loop plays under it. The panel holds the set and hands a new one
 * out on every edit, the same arrangement the kit grid has — so a set can be
 * rewritten while it is running, and the cue after the one you are hearing
 * is the one you just changed.
 */
export class StagePanel {
  readonly element: HTMLElement;
  private performance: StagePerformance;
  private running = false;
  private readonly startButton: HTMLButtonElement;
  private readonly statusLine: HTMLElement;
  private readonly totalLine: HTMLElement;
  private readonly loopButton: HTMLButtonElement;
  private readonly freshButtons = new Map<MovementCharacter | null, HTMLButtonElement>();
  private cueList!: HTMLElement;
  private readonly cueElements: HTMLElement[] = [];
  private lastStatus = '';
  private lastTotal = '';
  private liveIndex = -1;

  constructor(
    initial: StagePerformance,
    private readonly handlers: StagePanelHandlers,
  ) {
    this.performance = initial;
    this.element = document.createElement('div');
    this.element.className = 'stage-panel';
    this.element.addEventListener('dblclick', (e) => e.stopPropagation());

    this.startButton = document.createElement('button');
    this.startButton.type = 'button';
    this.startButton.className = 'stage-start';
    this.startButton.addEventListener('click', () => this.toggleRunning());

    this.statusLine = document.createElement('div');
    this.statusLine.className = 'stage-status';

    this.totalLine = document.createElement('div');
    this.totalLine.className = 'stage-total';

    const head = document.createElement('div');
    head.className = 'stage-head';
    head.append(this.startButton, this.statusLine);

    this.loopButton = document.createElement('button');
    this.loopButton.type = 'button';
    this.loopButton.textContent = 'Loop set';
    this.loopButton.title = 'run the set again from the top rather than stopping at the end';
    this.loopButton.addEventListener('click', () => {
      this.commit({ ...this.performance, loop: !this.performance.loop });
      this.syncOptions();
    });

    this.element.append(head, this.buildOptions(), this.buildCueList(), this.buildFoot());
    this.syncStart();
    this.syncOptions();
    this.renderCues();
  }

  getPerformance(): StagePerformance {
    return this.performance;
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Stopped from outside — leaving the mode, or the set running out. */
  setRunning(running: boolean): void {
    if (running === this.running) return;
    this.running = running;
    this.syncStart();
  }

  /**
   * Called each frame with where the set has got to.
   *
   * Two things move: which card is lit, and the line that says what is
   * happening. Both are gated on change — a set is minutes long and almost
   * every frame of it has nothing new to say.
   */
  update(
    state: RunnerState,
    position: CuePosition | null,
    bpm: number,
    loopHits: number,
  ): void {
    const index = position ? position.index : -1;
    if (index !== this.liveIndex) {
      this.liveIndex = index;
      this.cueElements.forEach((element, i) => {
        element.classList.toggle('is-live', i === index);
      });
    }

    const status = this.statusFor(state, position, loopHits);
    if (status !== this.lastStatus) {
      this.statusLine.textContent = status;
      this.lastStatus = status;
    }
    this.statusLine.classList.toggle('is-live', state === 'running');

    const bars = totalBars(this.performance);
    const seconds = estimateSeconds(this.performance, bpm);
    const total = `${this.performance.cues.length} cues · ${bars} bars · about ${formatDuration(seconds)} at ${Math.round(bpm)} bpm`;
    if (total !== this.lastTotal) {
      this.totalLine.textContent = total;
      this.lastTotal = total;
    }
  }

  /**
   * What the set is doing, in one line.
   *
   * The waiting states are the ones worth spelling out: a set that has been
   * started and is holding for the bar line, or for the fresh piece it asked
   * for, looks exactly like a button that did not work. `loopHits` is how
   * much is written in the kit grid, for the same reason.
   */
  private statusFor(
    state: RunnerState,
    position: CuePosition | null,
    loopHits: number,
  ): string {
    if (state === 'waiting') {
      return this.performance.startFresh
        ? 'waiting for a new piece to begin'
        : 'starting on the next bar';
    }
    if (state === 'done') return 'set finished';
    if (state === 'running' && position) {
      const cue = position.cue;
      const bars = position.barsLeft;
      const line = `cue ${position.index + 1} of ${this.performance.cues.length} — ${PHASE_LABELS[cue.phase]}, ${bars} bar${bars === 1 ? '' : 's'} left`;
      // A cue can ask for a loop that was never built, and silence is not an
      // answer anyone can debug from here.
      return cue.kit && loopHits === 0 ? `${line} · the loop is empty — build one in Kit` : line;
    }
    return 'not running — build the set, then press Run';
  }

  private toggleRunning(): void {
    this.running = !this.running;
    this.syncStart();
    if (this.running) this.handlers.onStart(this.performance);
    else this.handlers.onStop();
  }

  private syncStart(): void {
    this.startButton.textContent = this.running ? 'Stop' : 'Run set';
    this.startButton.classList.toggle('is-running', this.running);
    this.startButton.setAttribute('aria-pressed', String(this.running));
  }

  private commit(performance: StagePerformance): void {
    this.performance = performance;
    this.handlers.onChange(performance);
  }

  /** The two decisions that belong to the set rather than to a cue. */
  private buildOptions(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'stage-row stage-options';
    row.appendChild(this.loopButton);

    const label = document.createElement('span');
    label.className = 'stage-row-label';
    label.textContent = 'Start on';
    row.appendChild(label);

    for (const option of FRESH_OPTIONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.title = option.hint;
      button.addEventListener('click', () => {
        this.commit({ ...this.performance, startFresh: option.value });
        this.syncOptions();
      });
      this.freshButtons.set(option.value, button);
      row.appendChild(button);
    }
    return row;
  }

  private syncOptions(): void {
    this.loopButton.classList.toggle('is-active', this.performance.loop);
    this.loopButton.setAttribute('aria-pressed', String(this.performance.loop));
    for (const [value, button] of this.freshButtons) {
      const active = value === this.performance.startFresh;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  private buildCueList(): HTMLElement {
    this.cueList = document.createElement('div');
    this.cueList.className = 'stage-cues';
    return this.cueList;
  }

  private buildFoot(): HTMLElement {
    const foot = document.createElement('div');
    foot.className = 'stage-foot';

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'stage-add';
    add.textContent = 'Add cue';
    add.addEventListener('click', () => {
      this.commit(addCue(this.performance));
      this.renderCues();
    });

    foot.append(add, this.totalLine);
    return foot;
  }

  /**
   * Redraw the whole list.
   *
   * A full rebuild on every structural edit rather than a diff: the list is a
   * handful of cards, the edits that reach here are adds, removes and
   * reorders — each of which changes every index below it — and a stale index
   * in a click handler is how a delete button removes the wrong cue.
   */
  private renderCues(): void {
    this.cueList.replaceChildren();
    this.cueElements.length = 0;
    this.liveIndex = -1;
    this.performance.cues.forEach((cue, index) => {
      const element = this.buildCue(cue, index);
      this.cueElements.push(element);
      this.cueList.appendChild(element);
    });
  }

  private buildCue(cue: StageCue, index: number): HTMLElement {
    const card = document.createElement('div');
    card.className = 'stage-cue';

    const top = document.createElement('div');
    top.className = 'stage-cue-top';

    const number = document.createElement('span');
    number.className = 'stage-cue-index';
    number.textContent = String(index + 1);

    const phase = document.createElement('select');
    phase.className = 'stage-select';
    phase.setAttribute('aria-label', `Cue ${index + 1} phase`);
    for (const value of CUE_PHASES) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = PHASE_LABELS[value];
      if (value === cue.phase) option.selected = true;
      phase.appendChild(option);
    }
    phase.addEventListener('change', () => {
      this.commit(updateCue(this.performance, index, { phase: phase.value as StageCue['phase'] }));
    });

    const bars = document.createElement('select');
    bars.className = 'stage-select';
    bars.setAttribute('aria-label', `Cue ${index + 1} length`);
    for (const value of CUE_BAR_OPTIONS) {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = `${value} bar${value === 1 ? '' : 's'}`;
      if (value === cue.bars) option.selected = true;
      bars.appendChild(option);
    }
    bars.addEventListener('change', () => {
      this.commit(updateCue(this.performance, index, { bars: Number(bars.value) }));
    });

    top.append(number, phase, bars, this.buildTools(index));

    const bottom = document.createElement('div');
    bottom.className = 'stage-cue-bottom';
    for (const layer of PRESENCE_LAYERS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'stage-layer';
      button.textContent = LAYER_LABELS[layer];
      button.title = `${LAYER_LABELS[layer]} — in the room for this cue, or held back`;
      const sync = () => {
        const on = this.performance.cues[index]?.layers[layer] ?? true;
        button.classList.toggle('is-active', on);
        button.setAttribute('aria-pressed', String(on));
      };
      button.addEventListener('click', () => {
        const on = this.performance.cues[index]?.layers[layer] ?? true;
        this.commit(updateCue(this.performance, index, { layers: { [layer]: !on } }));
        sync();
      });
      sync();
      bottom.appendChild(button);
    }

    const kit = document.createElement('button');
    kit.type = 'button';
    kit.className = 'stage-kit';
    kit.textContent = 'Loop';
    kit.title = 'the loop built in Kit mode plays under this cue';
    const syncKit = () => {
      const on = this.performance.cues[index]?.kit ?? false;
      kit.classList.toggle('is-active', on);
      kit.setAttribute('aria-pressed', String(on));
    };
    kit.addEventListener('click', () => {
      const on = this.performance.cues[index]?.kit ?? false;
      this.commit(updateCue(this.performance, index, { kit: !on }));
      syncKit();
    });
    syncKit();
    bottom.appendChild(kit);

    card.append(top, bottom);
    return card;
  }

  private buildTools(index: number): HTMLElement {
    const tools = document.createElement('div');
    tools.className = 'stage-cue-tools';
    const buttons: { label: string; title: string; run: () => StagePerformance }[] = [
      { label: '↑', title: 'move this cue earlier', run: () => moveCue(this.performance, index, -1) },
      { label: '↓', title: 'move this cue later', run: () => moveCue(this.performance, index, 1) },
      { label: '+', title: 'duplicate this cue', run: () => duplicateCue(this.performance, index) },
      { label: '×', title: 'remove this cue', run: () => removeCue(this.performance, index) },
    ];
    for (const { label, title, run } of buttons) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.title = title;
      button.setAttribute('aria-label', title);
      button.addEventListener('click', () => {
        const next = run();
        // Every one of these changes the indices below it, so the list is
        // rebuilt rather than patched — see `renderCues`.
        if (next === this.performance) return;
        this.commit(next);
        this.renderCues();
      });
      tools.appendChild(button);
    }
    return tools;
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}
