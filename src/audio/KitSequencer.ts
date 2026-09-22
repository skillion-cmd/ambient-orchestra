import * as Tone from 'tone';
import {
  emptyPattern,
  patternSteps,
  STEP_VELOCITY,
  type KitPattern,
} from './KitPattern';
import { KIT_LAYOUT, type PlayKit } from './PlayKit';
import { stepAtTicks } from './TransportGrid';

/**
 * The loop, playing.
 *
 * One repeating transport event on the sixteenth, which reads the step its
 * own event time falls on and strikes whatever the pattern has written
 * there. Everything that makes this hard is in two decisions:
 *
 * **It rides the transport rather than a timer.** The event is scheduled in
 * musical time, so the loop follows every tempo the Conductor asks for — the
 * Tempo knob, a phase's sway, a night piece pulling the whole room up to
 * garage tempo — without the pattern ever drifting against the bar lines the
 * ensemble is playing to.
 *
 * **The step comes from the event's ticks, not from a counter.** A counter
 * would be a step behind after any dropped callback, and dropped callbacks
 * are what a stalled main thread produces. Deriving the step from the
 * transport position means a late callback plays the step it is actually on:
 * the loop can lose a hit under load, which is inaudible, but it cannot lose
 * its place, which is not.
 *
 * The pattern is replaced wholesale while it runs. Editing a grid cell during
 * playback swaps the whole object between one sixteenth and the next, which
 * is why nothing here holds an index into it.
 */
export class KitSequencer {
  private pattern: KitPattern = emptyPattern(2);
  private enabled = false;
  private eventId: number | null = null;

  constructor(private readonly kit: PlayKit) {}

  /**
   * Put the repeating event on the transport.
   *
   * Called once the audio context is running. The event stays scheduled for
   * the life of the session and costs nothing while the loop is off — a
   * callback that reads a flag and returns — which is a far better trade than
   * scheduling and unscheduling on every start and stop, where the loop would
   * restart on whatever sixteenth the button was pressed on.
   */
  attach(): void {
    if (this.eventId !== null) return;
    this.eventId = Tone.getTransport().scheduleRepeat((time) => this.tick(time), '16n');
  }

  setPattern(pattern: KitPattern): void {
    this.pattern = pattern;
  }

  getPattern(): KitPattern {
    return this.pattern;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * The step to light up, read from where the transport is *now*.
   *
   * Not the step the last callback played: callbacks run a lookahead ahead of
   * the audio clock, so following them would put the playhead permanently
   * early. This is what is sounding, which is what the eye is checking
   * against the ear.
   */
  getDisplayStep(): number {
    if (!this.enabled) return -1;
    const transport = Tone.getTransport();
    return stepAtTicks(
      Number(transport.ticks),
      transport.PPQ,
      patternSteps(this.pattern),
    );
  }

  /** Which bar of the loop the playhead is in — the panel's page marker. */
  getDisplayBar(): number {
    const step = this.getDisplayStep();
    return step < 0 ? -1 : Math.floor(step / 16);
  }

  dispose(): void {
    if (this.eventId !== null) {
      Tone.getTransport().clear(this.eventId);
      this.eventId = null;
    }
    this.enabled = false;
  }

  private tick(time: number): void {
    if (!this.enabled) return;
    const pattern = this.pattern;
    const total = patternSteps(pattern);
    const transport = Tone.getTransport();
    const step = stepAtTicks(transport.getTicksAtTime(time), transport.PPQ, total);

    for (const piece of KIT_LAYOUT) {
      const level = pattern.rows[piece][step] ?? 0;
      if (level === 0) continue;
      this.kit.strikeAt(piece, STEP_VELOCITY[level], time);
    }
  }
}
