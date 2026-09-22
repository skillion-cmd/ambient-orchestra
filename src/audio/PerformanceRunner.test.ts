import { describe, expect, it } from 'vitest';
import { makeCue, type StagePerformance } from './Performance';
import { PerformanceRunner } from './PerformanceRunner';

function setOf(cues: { bars: number }[], extra: Partial<StagePerformance> = {}): StagePerformance {
  return {
    loop: false,
    startFresh: null,
    cues: cues.map((c) => makeCue({ bars: c.bars })),
    ...extra,
  };
}

describe('PerformanceRunner', () => {
  it('starts idle and stays idle until armed', () => {
    const runner = new PerformanceRunner();
    expect(runner.getState()).toBe('idle');
    const tick = runner.advance(10, 0);
    expect(tick.state).toBe('idle');
    expect(tick.entered).toBeNull();
  });

  it('waits for the next bar line rather than starting mid-bar', () => {
    const runner = new PerformanceRunner();
    runner.start(setOf([{ bars: 2 }, { bars: 2 }]), 7, 0);
    expect(runner.getState()).toBe('waiting');
    // Still bar 7 — the set has not begun, so nothing has been applied.
    expect(runner.advance(7, 0).entered).toBeNull();
    const opened = runner.advance(8, 0);
    expect(opened.state).toBe('running');
    expect(opened.entered).not.toBeNull();
    expect(opened.position!.index).toBe(0);
  });

  it('applies each cue once, on the bar it opens', () => {
    const runner = new PerformanceRunner();
    runner.start(setOf([{ bars: 2 }, { bars: 3 }]), 0, 0);
    const entries: number[] = [];
    for (let bar = 1; bar <= 6; bar++) {
      // Two ticks a bar: the engine advances the runner every tick, not once
      // per bar, and a cue applied twice is a phase jump you can hear.
      for (const tick of [runner.advance(bar, 0), runner.advance(bar, 0)]) {
        if (tick.entered) entries.push(bar);
      }
    }
    expect(entries).toEqual([1, 3]);
  });

  it('counts down the bars left in the live cue', () => {
    const runner = new PerformanceRunner();
    runner.start(setOf([{ bars: 4 }]), 0, 0);
    expect(runner.advance(1, 0).position!.barsLeft).toBe(4);
    expect(runner.advance(2, 0).position!.barsLeft).toBe(3);
    expect(runner.advance(4, 0).position!.barsLeft).toBe(1);
  });

  it('ends once, at the end of a set that does not loop', () => {
    const runner = new PerformanceRunner();
    runner.start(setOf([{ bars: 2 }, { bars: 2 }]), 0, 0);
    runner.advance(1, 0);
    const ending = runner.advance(5, 0);
    expect(ending.ended).toBe(true);
    expect(ending.state).toBe('done');
    expect(ending.position).toBeNull();
    // And it stays ended — a finished set does not restart on the next tick.
    const after = runner.advance(6, 0);
    expect(after.ended).toBe(false);
    expect(after.state).toBe('done');
  });

  it('comes round to the top of a looping set', () => {
    const runner = new PerformanceRunner();
    runner.start(setOf([{ bars: 2 }, { bars: 2 }], { loop: true }), 0, 0);
    runner.advance(1, 0);
    expect(runner.advance(3, 0).position!.index).toBe(1);
    const wrapped = runner.advance(5, 0);
    expect(wrapped.ended).toBe(false);
    expect(wrapped.position!.index).toBe(0);
    expect(wrapped.entered).not.toBeNull();
    expect(wrapped.bar).toBe(0);
  });

  it('keeps its place after a long gap between ticks', () => {
    // A hidden tab hands the engine a backlog: the runner can be advanced
    // several bars at once and has to land on the right cue, not the next one.
    const runner = new PerformanceRunner();
    runner.start(setOf([{ bars: 2 }, { bars: 2 }], { loop: true }), 0, 0);
    runner.advance(1, 0);
    const jumped = runner.advance(11, 0);
    expect(jumped.bar).toBe(2);
    expect(jumped.position!.index).toBe(1);
  });

  it('holds for the fresh piece it asked for, and opens when it arrives', () => {
    const runner = new PerformanceRunner();
    runner.start(setOf([{ bars: 4 }], { startFresh: 'night' }), 3, 12);
    // Bars pass, the movement has not changed: still waiting.
    expect(runner.advance(4, 12).state).toBe('waiting');
    expect(runner.advance(5, 12).state).toBe('waiting');
    const opened = runner.advance(6, 13);
    expect(opened.state).toBe('running');
    expect(opened.entered).not.toBeNull();
    expect(opened.bar).toBe(0);
  });

  it('gives up waiting rather than never starting', () => {
    const runner = new PerformanceRunner();
    runner.start(setOf([{ bars: 4 }], { startFresh: 'open' }), 0, 5);
    expect(runner.advance(20, 5).state).toBe('waiting');
    expect(runner.advance(24, 5).state).toBe('running');
  });

  it('forgets everything on stop', () => {
    const runner = new PerformanceRunner();
    runner.start(setOf([{ bars: 4 }]), 0, 0);
    runner.advance(1, 0);
    expect(runner.isActive()).toBe(true);
    runner.stop();
    expect(runner.getState()).toBe('idle');
    expect(runner.getPosition()).toBeNull();
    expect(runner.advance(2, 0).entered).toBeNull();
  });
});
