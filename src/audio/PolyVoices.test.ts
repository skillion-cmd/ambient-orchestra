import { describe, expect, it } from 'vitest';
import { planSteals } from './PolyVoices';

// What the pads need from a re-strike: every note of the new voicing sounds,
// free voices are used before anything is taken, and what is taken is the
// voice that loses least by it.
describe('planSteals', () => {
  it('takes nothing while there are free voices for every note', () => {
    const plan = planSteals([60, 64, 67], 3, [62, 65, 69]);
    expect(plan.steals).toEqual([]);
    expect(plan.fresh).toEqual([0, 1, 2]);
  });

  it('never leaves a note without a voice while held voices remain', () => {
    // The orchestra's case: a full stack still releasing, a limit that fits
    // only one stack, and a re-strike of the same size.
    const held = [48, 52, 55, 60, 64, 67, 72, 76, 79];
    const notes = [50, 53, 57, 62, 65, 69, 74, 77, 81];
    const plan = planSteals(held, 5, notes);
    expect(plan.fresh.length + plan.steals.length).toBe(notes.length);
    expect(plan.steals.length).toBe(4);
  });

  it('re-strikes a voice already on the same pitch before anything else', () => {
    // An ensemble cue: the same chord again. Voices that only have to swell
    // back up are the seamless ones to take.
    const plan = planSteals([48, 60, 64, 67], 1, [60, 64, 67]);
    expect(plan.steals).toEqual([
      [1, 0],
      [2, 1],
    ]);
    expect(plan.fresh).toEqual([2]);
  });

  it('otherwise takes the oldest tails, for the top of the new voicing', () => {
    const plan = planSteals([40, 41, 42, 43], 2, [60, 62, 64, 66]);
    expect(plan.steals).toEqual([
      [0, 3],
      [1, 2],
    ]);
    expect(plan.fresh).toEqual([0, 1]);
  });

  it('never takes one held voice twice, even for a doubled note', () => {
    const plan = planSteals([60], 0, [60, 60]);
    expect(plan.steals).toEqual([[0, 0]]);
    expect(plan.fresh).toEqual([1]);
  });

  it('hands back the leftovers when there is nothing left to take', () => {
    const plan = planSteals([], 0, [60, 64]);
    expect(plan.steals).toEqual([]);
    expect(plan.fresh).toEqual([0, 1]);
  });
});
