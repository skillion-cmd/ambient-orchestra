import { cueAtBar, totalBars, type CuePosition, type StageCue, type StagePerformance } from './Performance';

/**
 * Walking a written performance against the transport.
 *
 * Idle → waiting → running → done, and the interesting state is `waiting`.
 * A set never begins the instant the button is pressed: it begins on a bar
 * line, because a performance that starts halfway through a bar is out of
 * step with the ensemble for its whole length. When the set asked for a fresh
 * piece it waits for that piece to actually arrive — the field takes a
 * dissolve bridge to get there — and begins at the top of it.
 *
 * Pure: bars in, cue changes out. It knows nothing about audio, so the whole
 * of it can be tested by counting.
 */

export type RunnerState = 'idle' | 'waiting' | 'running' | 'done';

export interface RunnerTick {
  state: RunnerState;
  /** The cue that became live on this tick — apply it, once. */
  entered: StageCue | null;
  /** Where the set has got to, or null while waiting and after the end. */
  position: CuePosition | null;
  /** True on the single tick the set finishes. */
  ended: boolean;
  /** Bars completed since the set began. */
  bar: number;
}

/**
 * How long to wait for a requested piece before starting anyway.
 *
 * Asking for a fresh piece is a request, not a command — the field consumes
 * it at its own next movement boundary, and the dissolve bridge in front of
 * that is up to fourteen seconds. Six or seven bars covers it at any tempo
 * this engine runs at; twenty-four is the point at which something has
 * clearly gone wrong and a set that never starts is worse than one that
 * starts over the tail of the old piece.
 */
const WAIT_BARS_MAX = 24;

export class PerformanceRunner {
  private state: RunnerState = 'idle';
  private performance: StagePerformance | null = null;
  /** The absolute transport bar the set's own bar 0 sits on. */
  private startBar = 0;
  /** Where the transport was when the set was armed — the wait's clock. */
  private armedBar = 0;
  /** The movement index at arming, so a change in it means the new piece. */
  private armedMovement = -1;
  private waitForMovement = false;
  private liveIndex = -1;
  private position: CuePosition | null = null;

  getState(): RunnerState {
    return this.state;
  }

  getPosition(): CuePosition | null {
    return this.position;
  }

  isActive(): boolean {
    return this.state === 'waiting' || this.state === 'running';
  }

  /**
   * Arm a set.
   *
   * `bar` is the transport's current bar and `movementIndex` the piece
   * currently running. Without a fresh piece the set opens on the next bar
   * line; with one it opens when the movement index moves, or after
   * `WAIT_BARS_MAX` if it never does.
   */
  start(performance: StagePerformance, bar: number, movementIndex: number): void {
    this.performance = performance;
    this.state = 'waiting';
    this.armedBar = bar;
    this.armedMovement = movementIndex;
    this.waitForMovement = performance.startFresh !== null;
    this.startBar = bar + 1;
    this.liveIndex = -1;
    this.position = null;
  }

  stop(): void {
    this.state = 'idle';
    this.performance = null;
    this.liveIndex = -1;
    this.position = null;
  }

  /**
   * Advance to the transport's current bar.
   *
   * Called every engine tick rather than once per bar, so it has to be safe
   * to call with the same bar repeatedly: `entered` is non-null only on the
   * tick a boundary is actually crossed, and everything else is derived.
   */
  advance(bar: number, movementIndex: number): RunnerTick {
    const performance = this.performance;
    if (!performance || this.state === 'idle' || this.state === 'done') {
      return { state: this.state, entered: null, position: this.position, ended: false, bar: 0 };
    }

    if (this.state === 'waiting') {
      const movementArrived = movementIndex !== this.armedMovement;
      const waited = bar - this.armedBar;
      const ready = this.waitForMovement
        ? movementArrived || waited >= WAIT_BARS_MAX
        : bar >= this.startBar;
      if (!ready) {
        return { state: 'waiting', entered: null, position: null, ended: false, bar: 0 };
      }
      // The set's bar 0 is this bar: whatever we were waiting for has
      // happened, and waiting one more bar to acknowledge it would put the
      // opening cue a bar late for no reason.
      this.startBar = bar;
      this.state = 'running';
    }

    const total = totalBars(performance);
    let elapsed = bar - this.startBar;
    if (elapsed < 0) elapsed = 0;

    if (elapsed >= total) {
      if (!performance.loop) {
        this.state = 'done';
        this.position = null;
        this.liveIndex = -1;
        return { state: 'done', entered: null, position: null, ended: true, bar: elapsed };
      }
      // Re-anchor rather than modulo the bar every tick: the set's own bar 0
      // moves forward one full length, so everything downstream — the live
      // cue, the countdown, the panel's playhead — keeps counting from a
      // start that is still a real bar line.
      const laps = Math.floor(elapsed / total);
      this.startBar += laps * total;
      elapsed -= laps * total;
    }

    const position = cueAtBar(performance, elapsed);
    this.position = position;
    const entered = position && position.index !== this.liveIndex ? position.cue : null;
    if (position) this.liveIndex = position.index;

    return { state: this.state, entered, position, ended: false, bar: elapsed };
  }
}
