/**
 * How much engine time to advance, given the audio clock.
 *
 * The engine used to be advanced from requestAnimationFrame deltas, which
 * broke in two ways. A hidden tab stops rAF entirely, so the Conductor
 * froze while Tone's transport kept firing the loops already running — the
 * music kept sounding but stopped composing, and the movement clock sat
 * still. And because each frame's delta was capped, any frame rate below
 * 20fps advanced the engine slower than real time: at 10fps a piece
 * progressed at half speed.
 *
 * Both go away by taking time from the audio context instead. It advances
 * whenever sound is actually being produced and stops when the context
 * suspends, so engine time always matches what was audible.
 */

/** Largest single step handed to the engine, in seconds. */
export const MAX_STEP_SEC = 0.25;

/**
 * Cap on how much backlog one call will work through. A tab left hidden
 * for an hour should not try to simulate an hour in one turn; the audible
 * result was a held texture either way, so catching up beyond this buys
 * nothing and would block the main thread on return.
 */
export const MAX_CATCHUP_SEC = 5;

export interface ClockStep {
  /** Sub-steps to feed the engine, each at most MAX_STEP_SEC. */
  steps: number[];
  /** Audio-clock time this call consumed up to. */
  consumedTo: number;
  /** Seconds of backlog discarded because they exceeded the catch-up cap. */
  dropped: number;
}

/**
 * Split the time since `lastAudioTime` into bounded sub-steps.
 *
 * Sub-stepping rather than one big delta keeps the Conductor's scheduling
 * behaving the same whether it is called at 60Hz or once a second: its
 * timers advance in increments it was tuned for instead of leaping past
 * several events at once.
 */
export function clockStep(audioTime: number, lastAudioTime: number): ClockStep {
  const elapsed = audioTime - lastAudioTime;
  if (!Number.isFinite(elapsed) || elapsed <= 0) {
    return { steps: [], consumedTo: Math.max(audioTime, lastAudioTime), dropped: 0 };
  }

  const dropped = Math.max(0, elapsed - MAX_CATCHUP_SEC);
  let remaining = elapsed - dropped;
  const steps: number[] = [];
  while (remaining > 1e-6) {
    const step = Math.min(MAX_STEP_SEC, remaining);
    steps.push(step);
    remaining -= step;
  }
  return { steps, consumedTo: audioTime, dropped };
}
