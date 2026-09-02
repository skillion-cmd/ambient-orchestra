import { beforeEach, describe, expect, it } from 'vitest';
import { fitToStep, MIN_EVENT_GAP_SEC, ScheduleTime } from './ScheduleTime';

// The whole point of this module is what happens when the clock repeats, so
// the tests hand it one they can hold still.
let now = 100;
const clock = () => now;
beforeEach(() => {
  now = 100;
});

describe('ScheduleTime', () => {
  it('hands back the clock when it has moved on', () => {
    const s = new ScheduleTime(clock);
    expect(s.next()).toBe(100);
    now = 100.5;
    expect(s.next()).toBe(100.5);
  });

  it('never repeats a time, however often the clock does', () => {
    const s = new ScheduleTime(clock);
    const times = [];
    // One engine catch-up: several update steps in one turn, one Tone.now().
    for (let i = 0; i < 8; i++) times.push(s.next());
    for (let i = 1; i < times.length; i++) {
      expect(times[i]!).toBeGreaterThan(times[i - 1]!);
    }
  });

  it('stays inaudibly close while doing it', () => {
    const s = new ScheduleTime(clock);
    const first = s.next();
    for (let i = 0; i < 100; i++) s.next();
    // A hundred events stacked in one turn still land inside 10ms.
    expect(s.next() - first).toBeLessThan(0.011);
  });

  it('jumps forward rather than crawling once the clock overtakes it', () => {
    const s = new ScheduleTime(clock);
    s.next();
    s.next();
    now = 130;
    expect(s.next()).toBe(130);
  });

  it('offsets from now, and still never repeats', () => {
    const s = new ScheduleTime(clock);
    expect(s.nextAfter(0.5)).toBe(100.5);
    // A later call with a smaller offset must not land before the earlier one.
    expect(s.nextAfter(0)).toBeGreaterThan(100.5);
    expect(s.nextAfter(0)).toBeCloseTo(100.5 + 2 * MIN_EVENT_GAP_SEC, 9);
  });

  it('keeps voices independent of one another', () => {
    const a = new ScheduleTime(clock);
    const b = new ScheduleTime(clock);
    for (let i = 0; i < 5; i++) a.next();
    // b has scheduled nothing, so it is not pushed along by a's backlog.
    expect(b.next()).toBe(100);
  });
});

describe('ScheduleTime.atLeast', () => {
  it('keeps the requested time — the groove is the point', () => {
    const s = new ScheduleTime(clock);
    expect(s.atLeast(140.25)).toBe(140.25);
    expect(s.atLeast(140.5)).toBe(140.5);
  });

  it('nudges only the hit that would land backwards', () => {
    const s = new ScheduleTime(clock);
    s.atLeast(140.5);
    // A tempo move shrank the gap under the swing offset: this step's time
    // came out before the one before it.
    const fixed = s.atLeast(140.48);
    expect(fixed).toBeGreaterThan(140.5);
    expect(fixed).toBeCloseTo(140.5 + MIN_EVENT_GAP_SEC, 9);
    // And the next in-order hit is unaffected.
    expect(s.atLeast(140.75)).toBe(140.75);
  });

  it('does not drag events onto the present the way next() would', () => {
    const s = new ScheduleTime(clock);
    // now is 100; the kit schedules well ahead of it and must stay there.
    expect(s.atLeast(140)).toBe(140);
  });
});

describe('fitToStep', () => {
  it('keeps the musical value when it fits', () => {
    // A 32nd at 240bpm is 7.8ms, well inside a 60ms step.
    expect(fitToStep(0.0078, 0.06)).toBeCloseTo(0.0078, 6);
  });

  it('trims it when the tempo makes it outlast the step', () => {
    // A 32nd at 60bpm is 31ms, longer than the step it has to fit inside.
    const fitted = fitToStep(0.031, 0.018);
    expect(fitted).toBeLessThan(0.018);
    expect(fitted).toBeCloseTo(0.018 * 0.85, 6);
  });

  it('always leaves room before the next attack', () => {
    for (const wanted of [0.005, 0.031, 0.25, 1.5]) {
      for (const step of [0.02, 0.06, 0.11, 0.18, 0.5]) {
        expect(fitToStep(wanted, step)).toBeLessThan(step);
      }
    }
  });
});
