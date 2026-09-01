import { describe, expect, it } from 'vitest';
import {
  focusPointAt,
  presenceAt,
  PRESENCE_LAYERS,
  PRESENCE_MAX,
  PRESENCE_MIN,
  type LayerPresence,
} from './LayerPresence';

/** Sample the rotation across a long stretch of session time. */
function sweep(seconds: number, step = 1, periodScale = 1): LayerPresence[] {
  const out: LayerPresence[] = [];
  for (let t = 0; t < seconds; t += step) {
    out.push(presenceAt(focusPointAt(t, periodScale)));
  }
  return out;
}

describe('presenceAt', () => {
  it('keeps every layer within the presence range', () => {
    for (const p of sweep(4000)) {
      for (const layer of PRESENCE_LAYERS) {
        expect(p[layer]).toBeGreaterThanOrEqual(PRESENCE_MIN - 1e-9);
        expect(p[layer]).toBeLessThanOrEqual(PRESENCE_MAX + 1e-9);
      }
    }
  });

  it('always holds exactly one layer at the front', () => {
    for (const p of sweep(2000)) {
      const peak = Math.max(...PRESENCE_LAYERS.map((l) => p[l]));
      expect(peak).toBeCloseTo(PRESENCE_MAX, 6);
    }
  });

  it('every layer both leads the mix and recedes near the floor', () => {
    const frames = sweep(20000, 2);
    for (const layer of PRESENCE_LAYERS) {
      const values = frames.map((f) => f[layer]);
      // leads: reaches the front at some point in the rotation
      expect(Math.max(...values)).toBeCloseTo(PRESENCE_MAX, 4);
      // recedes: falls away to near-absent at some other point, not
      // merely quiet — that depth is the whole point of the rotation
      expect(Math.min(...values)).toBeLessThan(0.2);
    }
  });

  it('recedes rather than dropping out — a receded layer is never silent', () => {
    for (const p of sweep(6000, 3)) {
      for (const layer of PRESENCE_LAYERS) {
        expect(p[layer]).toBeGreaterThan(0);
      }
    }
  });
});

describe('presenceAt with a silent layer', () => {
  it('still puts an audible layer at the front, wherever the focus sits', () => {
    for (let t = 0; t < 6000; t += 2) {
      const p = presenceAt(focusPointAt(t), 0.8, { pulse: true });
      const audible = PRESENCE_LAYERS.filter((l) => l !== 'pulse').map((l) => p[l]);
      expect(Math.max(...audible)).toBeCloseTo(PRESENCE_MAX, 6);
    }
  });

  it('never lets a silent layer exceed the front of the mix', () => {
    for (let t = 0; t < 6000; t += 2) {
      const p = presenceAt(focusPointAt(t), 0.8, { pulse: true });
      expect(p.pulse).toBeLessThanOrEqual(PRESENCE_MAX + 1e-9);
    }
  });

  it('a beat-carrying movement can still put the pulse in front', () => {
    let led = false;
    for (let t = 0; t < 20000; t += 2) {
      const p = presenceAt(focusPointAt(t));
      if (Math.abs(p.pulse - PRESENCE_MAX) < 1e-6) led = true;
    }
    expect(led).toBe(true);
  });
});

describe('focusPointAt', () => {
  it('does not retrace the same path — the rotation has no audible loop', () => {
    // Two points a full 71s period apart should differ, because the other
    // two periods are incommensurate with it.
    const a = focusPointAt(0);
    const b = focusPointAt(71 * 2 * Math.PI);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(0.05);
  });

  it('a larger period scale slows the walk down', () => {
    const fast = focusPointAt(60, 0.35);
    const slow = focusPointAt(60, 1.9);
    const origin = focusPointAt(0, 1.9);
    // Over the same 60s the stretched walk has travelled less far.
    expect(Math.hypot(slow[0] - origin[0], slow[1] - origin[1])).toBeLessThan(
      Math.hypot(fast[0] - origin[0], fast[1] - origin[1]),
    );
  });

  it('applies the drift offset on top of the walk', () => {
    const base = focusPointAt(10);
    const drifted = focusPointAt(10, 1, [0.2, -0.1]);
    expect(drifted[0]).toBeCloseTo(base[0] + 0.2, 9);
    expect(drifted[1]).toBeCloseTo(base[1] - 0.1, 9);
  });
});
