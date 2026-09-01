import { describe, expect, it } from 'vitest';
import { clockStep, MAX_CATCHUP_SEC, MAX_STEP_SEC } from './EngineClock';

const total = (steps: number[]): number => steps.reduce((a, b) => a + b, 0);

describe('clockStep', () => {
  it('advances by exactly the audio time that passed', () => {
    const { steps, consumedTo } = clockStep(10.4, 10);
    expect(total(steps)).toBeCloseTo(0.4, 9);
    expect(consumedTo).toBe(10.4);
  });

  it('never hands the engine a step larger than the cap', () => {
    for (const elapsed of [0.05, 0.3, 1, 3.7]) {
      const { steps } = clockStep(elapsed, 0);
      for (const s of steps) expect(s).toBeLessThanOrEqual(MAX_STEP_SEC + 1e-9);
    }
  });

  it('splits a coarse background tick into several engine steps', () => {
    // A hidden tab is throttled to about 1Hz; the engine still advances in
    // the increments its scheduling was tuned for.
    const { steps } = clockStep(1, 0);
    expect(steps.length).toBeGreaterThan(1);
    expect(total(steps)).toBeCloseTo(1, 9);
  });

  it('does nothing when the clock has not moved', () => {
    expect(clockStep(5, 5).steps).toEqual([]);
    expect(clockStep(5, 5).dropped).toBe(0);
  });

  it('never runs backwards if the clock is reset under it', () => {
    const { steps, consumedTo } = clockStep(2, 9);
    expect(steps).toEqual([]);
    expect(consumedTo).toBe(9);
  });

  it('caps the backlog after a long suspension rather than simulating it all', () => {
    const { steps, dropped, consumedTo } = clockStep(600, 0);
    expect(total(steps)).toBeCloseTo(MAX_CATCHUP_SEC, 6);
    expect(dropped).toBeCloseTo(600 - MAX_CATCHUP_SEC, 6);
    // Still consumes the whole span, so the backlog isn't replayed forever.
    expect(consumedTo).toBe(600);
  });

  it('keeps engine time in step with real time across many ticks', () => {
    // 60 seconds delivered as ragged ticks, the way a throttled timer does.
    let last = 0;
    let advanced = 0;
    for (let t = 0; t <= 60; t += 0.1 + Math.random() * 0.9) {
      const { steps, consumedTo } = clockStep(t, last);
      advanced += total(steps);
      last = consumedTo;
    }
    expect(advanced).toBeCloseTo(last, 6);
    expect(advanced).toBeGreaterThan(55);
  });
});
