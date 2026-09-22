import { describe, expect, it } from 'vitest';
import { barAtTicks, stepAtTicks, ticksPerBar, ticksPerStep } from './TransportGrid';

const PPQ = 192;

describe('ticksPerBar / ticksPerStep', () => {
  it('puts sixteen steps in a bar', () => {
    expect(ticksPerBar(PPQ) / ticksPerStep(PPQ)).toBe(16);
  });
});

describe('barAtTicks', () => {
  it('counts bars from zero', () => {
    expect(barAtTicks(0, PPQ)).toBe(0);
    expect(barAtTicks(ticksPerBar(PPQ) - 1, PPQ)).toBe(0);
    expect(barAtTicks(ticksPerBar(PPQ), PPQ)).toBe(1);
    expect(barAtTicks(ticksPerBar(PPQ) * 9.5, PPQ)).toBe(9);
  });

  it('never goes negative, whatever the transport hands back', () => {
    expect(barAtTicks(-500, PPQ)).toBe(0);
  });
});

describe('stepAtTicks', () => {
  it('wraps a two-bar loop every 32 steps', () => {
    const total = 32;
    expect(stepAtTicks(0, PPQ, total)).toBe(0);
    expect(stepAtTicks(ticksPerStep(PPQ) * 5, PPQ, total)).toBe(5);
    expect(stepAtTicks(ticksPerStep(PPQ) * 32, PPQ, total)).toBe(0);
    expect(stepAtTicks(ticksPerStep(PPQ) * 37, PPQ, total)).toBe(5);
  });

  it('starts every loop on a bar line', () => {
    for (const bars of [2, 4, 8]) {
      const total = bars * 16;
      // However many bars have passed, a bar that is a multiple of the loop
      // length lands on step 0 — the loop and the ensemble agree on "one".
      expect(stepAtTicks(ticksPerBar(PPQ) * bars * 3, PPQ, total)).toBe(0);
    }
  });

  it('rounds to the nearest step, so an event a hair early is not a step late', () => {
    const total = 32;
    const step = ticksPerStep(PPQ);
    expect(stepAtTicks(step * 4 - 0.4, PPQ, total)).toBe(4);
    expect(stepAtTicks(step * 4 + 0.4, PPQ, total)).toBe(4);
  });
});
