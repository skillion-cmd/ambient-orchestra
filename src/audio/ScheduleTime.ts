import * as Tone from 'tone';

/**
 * The smallest gap between two events on one node.
 *
 * Far below anything anyone could hear — a hundred events in one turn add up
 * to 10ms — and comfortably above the float precision Web Audio compares
 * these times at.
 */
export const MIN_EVENT_GAP_SEC = 1e-4;

/**
 * A strictly increasing schedule time for one sounding node.
 *
 * `Tone.now()` is not a clock you can call twice. It reads the audio
 * context's current time, which only advances once per render quantum
 * (a couple of milliseconds), so every call inside one JavaScript turn —
 * and often across several turns — hands back the identical value. Web Audio
 * rejects two events at the same time on the same voice with "Start time must
 * be strictly greater than previous start time", and the throw escapes into
 * whatever was iterating at the time.
 *
 * The engine hits this constantly, because `clockStep` deliberately splits a
 * backlog into several sub-steps and runs them in one synchronous loop: every
 * sub-step sees the same `Tone.now()`, so any voice that fires a note on more
 * than one of them schedules twice at the same instant. A monophonic synth
 * throws on the second. Two calls that land in one quantum were meant to be
 * simultaneous anyway, so nudging the later one past the earlier is both the
 * fix and the musically right answer.
 *
 * One of these per node that gets triggered — the constraint is per node, and
 * sharing one across the orchestra would push unrelated voices apart for no
 * reason.
 */
export class ScheduleTime {
  private last = 0;

  /** The clock is a parameter so this is testable without an audio context —
   * the behaviour under test is precisely what happens when the clock
   * repeats, which a real one only does when it feels like it. */
  constructor(private readonly clock: () => number = () => Tone.now()) {}

  /** The next time to schedule at, always past the one before it. */
  next(): number {
    const time = Math.max(this.clock(), this.last + MIN_EVENT_GAP_SEC);
    this.last = time;
    return time;
  }

  /**
   * The requested time, unless that would land on or before the last event.
   *
   * For anything scheduled *ahead* of now — a `Tone.Loop` callback places its
   * hits at the transport time it was handed, plus swing and per-step nudges.
   * Those offsets are drawn independently of the gap between steps, and a
   * tempo move can shrink the gap under the offsets, so two hits on one drum
   * can invert. Anchoring to `now` instead would be worse than the throw: it
   * would collapse the groove onto the present. This keeps the requested time
   * whenever it is usable and only nudges the ones that would go backwards.
   */
  atLeast(requestedSec: number): number {
    const time = Math.max(requestedSec, this.last + MIN_EVENT_GAP_SEC);
    this.last = time;
    return time;
  }

  /** As `next()`, but no earlier than `offsetSec` from now — for the
   * deliberately-delayed second attack a few voices use to overlap a chord
   * change with the one it is replacing. */
  nextAfter(offsetSec: number): number {
    const time = Math.max(this.clock() + offsetSec, this.last + MIN_EVENT_GAP_SEC);
    this.last = time;
    return time;
  }
}

/**
 * A note length that cannot outlast the step that follows it.
 *
 * The stepping voices ask for a note value — a 16th, a 32nd — and then fire
 * again on a fixed wall-clock interval. Those two are set independently, so
 * below a certain tempo the note is longer than the gap and a monophonic
 * synth is asked to re-attack while it is still releasing: a stolen note and
 * a click, and one more way to schedule out of order. Trimming to just under
 * the step keeps the musical value wherever it fits and gives up only the
 * tail that was never going to be heard.
 *
 * Takes seconds rather than a note value so it stays independent of the
 * transport — resolving `'32n'` is the caller's business, and its answer
 * depends on a tempo this has no opinion about.
 */
export function fitToStep(wantedSec: number, stepSec: number): number {
  return Math.min(wantedSec, stepSec * 0.85);
}
