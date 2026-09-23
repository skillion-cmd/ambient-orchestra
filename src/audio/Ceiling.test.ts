import { describe, expect, it } from 'vitest';
import { CEILING_PEAK, CEILING_TRANSPARENT_BELOW, ceilingCurve, compressorMakeupGain } from './Ceiling';

// The curve is what stands between the mix and a clipped destination, so the
// properties worth pinning are the two it exists for: it does nothing to
// ordinary material, and there is no input it lets past the ceiling.
describe('ceilingCurve', () => {
  const curve = ceilingCurve();
  const at = (x: number) => {
    const i = Math.round(((x + 1) / 2) * (curve.length - 1));
    return curve[Math.max(0, Math.min(curve.length - 1, i))]!;
  };

  it('is the identity everywhere the mix actually sits', () => {
    // The engine runs 10dB or more under this; nothing here may be coloured.
    for (const x of [-0.7, -0.4, -0.05, 0, 0.05, 0.4, 0.7]) {
      expect(at(x)).toBeCloseTo(x, 3);
    }
  });

  it('costs almost nothing at the limiter threshold above it', () => {
    // The master limiter sits at -2dBFS; the curve must not be audible there.
    const threshold = Math.pow(10, -2 / 20);
    const loss = 20 * Math.log10(at(threshold) / threshold);
    expect(loss).toBeGreaterThan(-0.1);
  });

  it('never lets a sample past the ceiling, in either direction', () => {
    for (const value of curve) {
      expect(Math.abs(value)).toBeLessThanOrEqual(CEILING_PEAK);
    }
    // The endpoints are what a WaveShaper clamps everything beyond +/-1 to,
    // so they are the real ceiling for an overdriven input.
    expect(Math.abs(curve[0]!)).toBeLessThan(1);
    expect(Math.abs(curve[curve.length - 1]!)).toBeLessThan(1);
  });

  it('bends rather than corners, and never turns back on itself', () => {
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]!).toBeGreaterThan(curve[i - 1]!);
    }
  });

  it('is symmetric, so it adds no DC offset', () => {
    for (let i = 0; i < curve.length; i++) {
      expect(curve[i]!).toBeCloseTo(-curve[curve.length - 1 - i]!, 9);
    }
  });

  it('keeps its knee under the threshold it is backing up', () => {
    expect(CEILING_TRANSPARENT_BELOW).toBeLessThan(CEILING_PEAK);
    expect(CEILING_PEAK).toBeLessThan(1);
  });
});

// The browser's own makeup gain, reproduced so it can be taken back off. The
// expected values are measured, not derived: a 200Hz sine through a native
// DynamicsCompressorNode in Chrome at each of the engine's limiter settings.
// If these drift, every limiter in the chain is either over or under its
// threshold by the difference.
describe('compressorMakeupGain', () => {
  const makeupDb = (threshold: number) => 20 * Math.log10(compressorMakeupGain(threshold, 1, 20));

  it('matches what Chrome adds at each limiter setting the engine uses', () => {
    expect(makeupDb(-2)).toBeCloseTo(0.98, 1);
    expect(makeupDb(-6)).toBeCloseTo(3.26, 1);
    expect(makeupDb(-8)).toBeCloseTo(4.4, 1);
  });

  it('adds nothing when the threshold is at full scale', () => {
    expect(makeupDb(0)).toBeCloseTo(0, 1);
  });

  it('matches it for a soft-kneed compressor too', () => {
    // The glue's settings, measured the same way: -30dBFS in, -29.19 out.
    const glue = 20 * Math.log10(compressorMakeupGain(-20, 30, 2));
    expect(glue).toBeCloseTo(0.81, 1);
  });
});
