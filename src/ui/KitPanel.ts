import {
  clearRow,
  cycleStep,
  emptyPattern,
  hitCount,
  KIT_LABELS,
  KIT_PATTERN_PRESETS,
  KIT_ROWS,
  LOOP_BAR_OPTIONS,
  patternFromPreset,
  resizePattern,
  STEPS_PER_BAR,
  type KitLoopBars,
  type KitPattern,
} from '../audio/KitPattern';
import type { KitPieceId } from '../audio/PlayKit';
import type { HarmonicContext } from '../audio/types';

export interface KitPanelHandlers {
  /** The grid changed — hand it to the sequencer and remember it. */
  onPattern(pattern: KitPattern): void;
  /** Start or stop the loop. */
  onPlaying(playing: boolean): void;
  /** Audition one piece: a row label, pressed. */
  onAudition(piece: KitPieceId): void;
}

/**
 * The step grid — Kit mode's whole surface.
 *
 * Twelve rows and one bar of columns at a time, with a pager for the rest.
 * A bar at a time rather than the whole loop, because eight bars is 128
 * columns: on any screen this app runs on those are three pixels wide, which
 * is neither readable nor clickable. A drum machine solves it the same way
 * and for the same reason — you edit a bar, you hear the loop.
 *
 * The panel owns the pattern and hands a new one out on every edit; the
 * sequencer holds whatever it was last given. Nothing here reaches into the
 * audio side, and nothing on the audio side reads the DOM.
 */
export class KitPanel {
  readonly element: HTMLElement;
  private pattern: KitPattern;
  private playing = false;
  /** Which bar of the loop is being edited. */
  private page = 0;
  private readonly barButtons = new Map<KitLoopBars, HTMLButtonElement>();
  private readonly pageButtons: HTMLButtonElement[] = [];
  private pageRow!: HTMLElement;
  private grid!: HTMLElement;
  private readonly cells = new Map<string, HTMLElement>();
  private readonly playButton: HTMLButtonElement;
  private readonly countLine: HTMLElement;
  private readonly keyLine: HTMLElement;
  private lastCountLine = '';
  private lastKeyLine = '';
  /** The step the playhead was last drawn on, so a frame that did not move
   * it touches no DOM at all. */
  private litStep = -1;

  constructor(
    initial: KitPattern,
    private readonly handlers: KitPanelHandlers,
  ) {
    this.pattern = initial;
    this.element = document.createElement('div');
    this.element.className = 'kit-panel';
    // Two cells clicked quickly is a double-click, and the document-level
    // handler for that hides the rails out from under the grid.
    this.element.addEventListener('dblclick', (e) => e.stopPropagation());

    this.playButton = document.createElement('button');
    this.playButton.type = 'button';
    this.playButton.className = 'kit-play';
    this.playButton.addEventListener('click', () => this.setPlaying(!this.playing));

    this.countLine = document.createElement('div');
    this.countLine.className = 'kit-count';

    this.keyLine = document.createElement('div');
    this.keyLine.className = 'kit-key';

    const head = document.createElement('div');
    head.className = 'kit-head';
    head.append(this.playButton, this.buildBarRow(), this.countLine);

    this.grid = this.buildGrid();

    this.element.append(
      head,
      this.buildPageRow(),
      this.grid,
      this.buildPresetRow(),
      this.keyLine,
    );

    this.syncBars();
    this.syncPlaying();
    this.syncCells();
  }

  getPattern(): KitPattern {
    return this.pattern;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  setPlaying(playing: boolean): void {
    if (playing === this.playing) return;
    this.playing = playing;
    this.syncPlaying();
    this.handlers.onPlaying(playing);
  }

  /**
   * Called each frame: the playhead, and the two lines that say what the loop
   * is and what key it is in.
   *
   * `step` is the sequencer's own display step, which is -1 while the loop is
   * stopped. The playhead is only drawn on the bar being edited — a lit
   * column on a page you are not looking at is not a playhead, it is a lie
   * about where the loop is.
   */
  update(harmonic: HarmonicContext, step: number, bpm: number): void {
    const visible = step >= 0 && Math.floor(step / STEPS_PER_BAR) === this.page;
    const lit = visible ? step % STEPS_PER_BAR : -1;
    if (lit !== this.litStep) {
      this.litStep = lit;
      for (let i = 0; i < STEPS_PER_BAR; i++) {
        this.columnCells(i).forEach((cell) => cell.classList.toggle('is-playhead', i === lit));
      }
    }
    this.syncPageMarker(step);

    const hits = hitCount(this.pattern);
    const seconds = (this.pattern.bars * 4 * 60) / Math.max(1, bpm);
    const count =
      hits === 0
        ? 'empty — tap the grid, or start from a pattern below'
        : `${hits} hit${hits === 1 ? '' : 's'} · ${this.pattern.bars} bars · ${seconds.toFixed(1)}s at ${Math.round(bpm)} bpm`;
    if (count !== this.lastCountLine) {
      this.countLine.textContent = count;
      this.lastCountLine = count;
    }

    const key = `${harmonic.root} ${harmonic.mode} — kick, toms and sub are tuned to it`;
    if (key !== this.lastKeyLine) {
      this.keyLine.textContent = key;
      this.lastKeyLine = key;
    }
  }

  private setPattern(pattern: KitPattern): void {
    this.pattern = pattern;
    this.handlers.onPattern(pattern);
  }

  /**
   * How long the loop is.
   *
   * Changing it rebuilds the grid because the pager changes with it, and
   * `resizePattern` decides what happens to the bars already written — it
   * tiles rather than padding, so four bars opens as the two you had, twice.
   */
  private buildBarRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'kit-row kit-bars';
    const label = document.createElement('span');
    label.className = 'kit-row-label';
    label.textContent = 'Loop';
    row.appendChild(label);
    for (const bars of LOOP_BAR_OPTIONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(bars);
      button.title = `${bars} bars — the loop repeats every ${bars} bars of the piece`;
      button.addEventListener('click', () => this.setBars(bars));
      this.barButtons.set(bars, button);
      row.appendChild(button);
    }
    return row;
  }

  private setBars(bars: KitLoopBars): void {
    if (bars === this.pattern.bars) return;
    this.setPattern(resizePattern(this.pattern, bars));
    this.page = Math.min(this.page, bars - 1);
    this.syncBars();
    this.rebuildPages();
    this.syncCells();
  }

  private syncBars(): void {
    for (const [bars, button] of this.barButtons) {
      const active = bars === this.pattern.bars;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  private buildPageRow(): HTMLElement {
    this.pageRow = document.createElement('div');
    this.pageRow.className = 'kit-row kit-pages';
    this.rebuildPages();
    return this.pageRow;
  }

  /** One button per bar of the loop, plus the word that says what they are. */
  private rebuildPages(): void {
    this.pageRow.replaceChildren();
    this.pageButtons.length = 0;
    const label = document.createElement('span');
    label.className = 'kit-row-label';
    label.textContent = 'Bar';
    this.pageRow.appendChild(label);
    for (let bar = 0; bar < this.pattern.bars; bar++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(bar + 1);
      button.addEventListener('click', () => {
        if (this.page === bar) return;
        this.page = bar;
        this.litStep = -1;
        this.syncPages();
        this.syncCells();
      });
      this.pageButtons.push(button);
      this.pageRow.appendChild(button);
    }
    this.syncPages();
  }

  private syncPages(): void {
    this.pageButtons.forEach((button, bar) => {
      const active = bar === this.page;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  /**
   * Mark the bar the loop is actually in.
   *
   * The pager does not follow the playhead — an editor that jumps pages under
   * your hand every two seconds is unusable — so the bar being played is
   * marked instead, and moving there is one click.
   */
  private syncPageMarker(step: number): void {
    const playingBar = step < 0 ? -1 : Math.floor(step / STEPS_PER_BAR);
    this.pageButtons.forEach((button, bar) => {
      button.classList.toggle('is-sounding', bar === playingBar);
    });
  }

  /**
   * The grid.
   *
   * A row per piece in drum-machine order (see `KIT_ROWS`), each row a label
   * that auditions the piece and sixteen cells. Every fourth cell carries
   * `is-beat` so the quarter notes are visible without counting — a grid
   * without them is sixteen identical boxes and every hit lands a step out.
   */
  private buildGrid(): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'kit-grid';
    this.cells.clear();

    for (const piece of KIT_ROWS) {
      const row = document.createElement('div');
      row.className = 'kit-grid-row';

      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'kit-piece';
      label.textContent = KIT_LABELS[piece];
      label.title = `${KIT_LABELS[piece]} — click to hear it, shift-click to clear the row`;
      label.addEventListener('click', (e) => {
        if (e.shiftKey) {
          this.setPattern(clearRow(this.pattern, piece));
          this.syncCells();
          return;
        }
        this.handlers.onAudition(piece);
      });
      row.appendChild(label);

      const steps = document.createElement('div');
      steps.className = 'kit-steps';
      for (let i = 0; i < STEPS_PER_BAR; i++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = i % 4 === 0 ? 'kit-cell is-beat' : 'kit-cell';
        cell.addEventListener('click', () => this.toggle(piece, i));
        this.cells.set(cellKey(piece, i), cell);
        steps.appendChild(cell);
      }
      row.appendChild(steps);
      grid.appendChild(row);
    }
    return grid;
  }

  private toggle(piece: KitPieceId, column: number): void {
    const step = this.page * STEPS_PER_BAR + column;
    this.setPattern(cycleStep(this.pattern, piece, step));
    this.syncCell(piece, column);
  }

  private syncCells(): void {
    for (const piece of KIT_ROWS) {
      for (let i = 0; i < STEPS_PER_BAR; i++) this.syncCell(piece, i);
    }
  }

  private syncCell(piece: KitPieceId, column: number): void {
    const cell = this.cells.get(cellKey(piece, column));
    if (!cell) return;
    const level = this.pattern.rows[piece][this.page * STEPS_PER_BAR + column] ?? 0;
    cell.classList.toggle('is-on', level > 0);
    cell.classList.toggle('is-accent', level === 2);
    const state = level === 2 ? 'accent' : level === 1 ? 'hit' : 'silent';
    cell.setAttribute(
      'aria-label',
      `${KIT_LABELS[piece]}, bar ${this.page + 1} step ${column + 1}: ${state}`,
    );
  }

  private columnCells(column: number): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const piece of KIT_ROWS) {
      const cell = this.cells.get(cellKey(piece, column));
      if (cell) out.push(cell);
    }
    return out;
  }

  /**
   * Somewhere to start.
   *
   * A preset replaces the grid rather than merging into it — merging two
   * grooves gives a third one nobody wrote — and Clear sits in the same row
   * because it is the same kind of decision made the other way.
   */
  private buildPresetRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'kit-row kit-presets';
    const label = document.createElement('span');
    label.className = 'kit-row-label';
    label.textContent = 'Start from';
    row.appendChild(label);

    for (const preset of KIT_PATTERN_PRESETS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = preset.label;
      button.title = preset.hint;
      button.addEventListener('click', () => {
        this.setPattern(patternFromPreset(preset, this.pattern.bars));
        this.syncCells();
      });
      row.appendChild(button);
    }

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'kit-clear';
    clear.textContent = 'Clear';
    clear.title = 'empty the grid — the loop length stays';
    clear.addEventListener('click', () => {
      this.setPattern(emptyPattern(this.pattern.bars));
      this.syncCells();
    });
    row.appendChild(clear);
    return row;
  }

  private syncPlaying(): void {
    this.playButton.textContent = this.playing ? 'Stop' : 'Play loop';
    this.playButton.classList.toggle('is-playing', this.playing);
    this.playButton.setAttribute('aria-pressed', String(this.playing));
    if (!this.playing) {
      this.litStep = -1;
      for (let i = 0; i < STEPS_PER_BAR; i++) {
        this.columnCells(i).forEach((cell) => cell.classList.remove('is-playhead'));
      }
      this.pageButtons.forEach((button) => button.classList.remove('is-sounding'));
    }
  }
}

function cellKey(piece: KitPieceId, column: number): string {
  return `${piece}:${column}`;
}
