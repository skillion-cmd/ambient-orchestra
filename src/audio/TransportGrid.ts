/**
 * Where the transport is, counted in things a sequencer can use.
 *
 * Both of these take ticks rather than seconds, and that is the whole point.
 * `MusicalClock` derives its bar from `transport.seconds / beatDuration`,
 * which is the right answer for "how far into the piece are we" and the
 * wrong one for "which bar of my loop is this": divide elapsed seconds by a
 * tempo that just changed and the bar number jumps — backwards when the
 * piece speeds up, forwards when it slows — and a pattern keyed off it would
 * skip a bar or replay one every time the Tempo knob moved or a night piece
 * pulled the transport up to garage tempo.
 *
 * Ticks have no such problem. They are the transport's own musical time:
 * they advance at PPQ per quarter note whatever the BPM is doing, they never
 * go backwards, and a tempo ramp changes how fast they accumulate rather
 * than what any given tick means. So a loop built on ticks stays locked to
 * the orchestra's bar lines through any tempo the Conductor asks for.
 */

/** Ticks in one 4/4 bar at the transport's resolution. */
export function ticksPerBar(ppq: number): number {
  return ppq * 4;
}

/** Ticks in one sixteenth — the sequencer's step. */
export function ticksPerStep(ppq: number): number {
  return ppq / 4;
}

/** Which bar of the session a tick count falls in, counting from zero. */
export function barAtTicks(ticks: number, ppq: number): number {
  return Math.floor(Math.max(0, ticks) / ticksPerBar(ppq));
}

/**
 * Which step of a `totalSteps`-long loop a tick count falls on.
 *
 * Rounded, not floored: a repeat callback is handed the exact transport time
 * of its own event, and that time converted back to ticks lands a hair either
 * side of the tick the event was scheduled at. Flooring turns the ones that
 * land a hair short into the previous step, which reads as a dropped hit
 * followed by a doubled one.
 *
 * Step 0 is a bar line by construction — `totalSteps` is always a whole
 * number of bars — so the loop and the ensemble agree about where "one" is.
 */
export function stepAtTicks(ticks: number, ppq: number, totalSteps: number): number {
  if (totalSteps <= 0) return 0;
  const step = Math.round(Math.max(0, ticks) / ticksPerStep(ppq));
  return ((step % totalSteps) + totalSteps) % totalSteps;
}
