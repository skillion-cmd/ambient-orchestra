import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CHROMA_CEILING, moodChroma } from './Chroma';

const out = new THREE.Vector3();

describe('harmonic chroma', () => {
  it('is neutral at a neutral mood', () => {
    // Signed zero is fine here — the shader adds it and renders identically.
    const c = moodChroma(0, out);
    expect(c.x).toBeCloseTo(0, 12);
    expect(c.y).toBeCloseTo(0, 12);
    expect(c.z).toBeCloseTo(0, 12);
  });

  it('warms toward amber and cools toward blue-violet', () => {
    const warm = moodChroma(1, out).clone();
    expect(warm.x).toBeGreaterThan(0);
    expect(warm.z).toBeLessThan(0);

    const cool = moodChroma(-1, out).clone();
    expect(cool.z).toBeGreaterThan(0);
    expect(cool.x).toBeLessThan(0);
  });

  it('never exceeds the ceiling, however hard the harmony pushes', () => {
    for (const mood of [-8, -1, -0.5, 0, 0.5, 1, 8]) {
      const c = moodChroma(mood, out);
      for (const v of [c.x, c.y, c.z]) {
        expect(Math.abs(v)).toBeLessThanOrEqual(CHROMA_CEILING + 1e-9);
      }
    }
  });

  it('keeps green nearly still, so a shift reads as light and not as a fault', () => {
    for (const mood of [-1, 1]) {
      const c = moodChroma(mood, out);
      expect(Math.abs(c.y)).toBeLessThan(Math.abs(c.x) / 2);
      expect(Math.abs(c.y)).toBeLessThan(Math.abs(c.z) / 2);
    }
  });

  it('scales linearly, so the six-second mood smoothing carries through', () => {
    const half = moodChroma(0.5, out).clone();
    const full = moodChroma(1, out).clone();
    expect(half.x).toBeCloseTo(full.x / 2, 9);
    expect(half.z).toBeCloseTo(full.z / 2, 9);
  });
});
