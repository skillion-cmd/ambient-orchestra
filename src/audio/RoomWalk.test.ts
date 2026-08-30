import { describe, expect, it } from 'vitest';
import { audibility, RoomWalk, THRESHOLD, type Rng } from './RoomWalk';

/** Deterministic rng cycling a fixed list, so excursions are reproducible. */
function seeded(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length]!;
}

/** Run the walk until `stop` says so, collecting every state. */
function run(
  walk: RoomWalk,
  steps: number,
  dt = 0.5,
): { doorways: number; positions: number[]; corridors: number[] } {
  let doorways = 0;
  const positions: number[] = [];
  const corridors: number[] = [];
  for (let i = 0; i < steps; i++) {
    const s = walk.update(dt);
    if (s.doorway) doorways++;
    positions.push(s.position);
    corridors.push(s.corridor);
  }
  return { doorways, positions, corridors };
}

describe('RoomWalk', () => {
  it('keeps the listener position inside [0, 1]', () => {
    const walk = new RoomWalk();
    walk.setScale('epic');
    const { positions } = run(walk, 4000);
    for (const p of positions) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('rests at home until an excursion begins', () => {
    const walk = new RoomWalk(seeded([0.5]));
    walk.setScale('short'); // 90–180s between excursions
    const { positions } = run(walk, 20, 0.5); // 10s in
    expect(Math.max(...positions)).toBeLessThan(0.1);
  });

  it('a forced crossing passes the threshold and fires exactly one doorway', () => {
    const walk = new RoomWalk(seeded([0.5]));
    walk.setScale('standard');
    walk.forceCrossing();
    // 150s: long enough for the crossing out and back (~80s), short enough
    // that the next scheduled excursion (~110s of rest later) hasn't begun.
    const { doorways, positions } = run(walk, 300);
    expect(doorways).toBe(1);
    expect(Math.max(...positions)).toBeGreaterThan(THRESHOLD);
  });

  it('always comes back home after an excursion', () => {
    const walk = new RoomWalk(seeded([0.5]));
    walk.setScale('standard');
    walk.forceCrossing();
    run(walk, 300);
    expect(walk.getPosition()).toBe(0);
    expect(walk.isExcursion()).toBe(false);
  });

  it('the corridor peaks at the threshold and is zero at rest', () => {
    const walk = new RoomWalk(seeded([0.5]));
    walk.setScale('standard');
    walk.forceCrossing();
    const { corridors, positions } = run(walk, 300);

    const peakIdx = corridors.indexOf(Math.max(...corridors));
    expect(Math.abs(positions[peakIdx]! - THRESHOLD)).toBeLessThan(0.05);
    expect(corridors[0]).toBeLessThan(0.05);
    expect(corridors[corridors.length - 1]).toBeLessThan(0.05);
  });

  it('a peek leans toward the doorway without ever trading the rooms', () => {
    // rng always 0 → PEEK_CHANCE always taken, shortest rest and apex.
    const walk = new RoomWalk(seeded([0]));
    walk.setScale('epic');
    const { doorways, positions } = run(walk, 6000);
    expect(doorways).toBe(0);
    expect(Math.max(...positions)).toBeGreaterThan(0.2);
    expect(Math.max(...positions)).toBeLessThan(THRESHOLD);
  });

  it('a fragment only ever crosses when the engine forces it', () => {
    const walk = new RoomWalk(seeded([0.9]));
    walk.setScale('fragment');
    // 200s — twice the longest a fragment ever runs, and it still hasn't
    // wandered on its own.
    expect(run(walk, 400).doorways).toBe(0);
    walk.forceCrossing();
    expect(run(walk, 300).doorways).toBe(1);
  });

  it('longer movements wander more often than short ones', () => {
    const count = (scale: 'short' | 'epic'): number => {
      // rng 0.99 → longest rest in range, no peeks, slowest crossing.
      const walk = new RoomWalk(seeded([0.99]));
      walk.setScale(scale);
      return run(walk, 6000).doorways;
    };
    expect(count('epic')).toBeGreaterThan(count('short'));
  });
});

describe('audibility', () => {
  it('a room next door is muffled and reverberant; the one you are in is open', () => {
    const far = audibility(0, 0);
    const near = audibility(1, 0);
    expect(far.gain).toBeLessThan(near.gain);
    expect(far.cutoff).toBeLessThan(near.cutoff);
    expect(far.reverbSend).toBeGreaterThan(near.reverbSend);
  });

  it('the threshold blurs both rooms — darker and wetter than either alone', () => {
    const clear = audibility(0.5, 0);
    const blurred = audibility(0.5, 1);
    expect(blurred.cutoff).toBeLessThan(clear.cutoff);
    expect(blurred.reverbSend).toBeGreaterThan(clear.reverbSend);
  });

  it('is concave, so the neighbouring room is audible before you reach it', () => {
    expect(audibility(0.25, 0).gain).toBeGreaterThan(0.25);
  });
});
