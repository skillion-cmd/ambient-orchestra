import { describe, expect, it } from 'vitest';
import { createFlowField, flowCharacterFor, type FlowParams, type FlowVector } from './flow';

const P: FlowParams = { scale: 0.09, warp: 0.6, evolve: 3.2 };

function divergenceAt(field: ReturnType<typeof createFlowField>, x: number, y: number): number {
  // Same step the field uses internally — the mixed second differences then
  // cancel exactly, which is precisely the divergence-free curl property.
  const h = 0.05;
  const a: FlowVector = { vx: 0, vy: 0 };
  const b: FlowVector = { vx: 0, vy: 0 };
  field(x + h, y, P, a);
  field(x - h, y, P, b);
  const dvxdx = (a.vx - b.vx) / (2 * h);
  field(x, y + h, P, a);
  field(x, y - h, P, b);
  const dvydy = (a.vy - b.vy) / (2 * h);
  return dvxdx + dvydy;
}

describe('flow field', () => {
  it('is divergence-free (curl noise never piles particles up)', () => {
    const field = createFlowField(42);
    for (const [x, y] of [
      [0, 0],
      [3.7, -2.1],
      [-8.4, 5.5],
      [11.2, 7.9],
      [-0.3, -6.6],
    ] as const) {
      expect(Math.abs(divergenceAt(field, x, y))).toBeLessThan(1e-6);
    }
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const a: FlowVector = { vx: 0, vy: 0 };
    const b: FlowVector = { vx: 0, vy: 0 };
    createFlowField(7)(1.5, -2.5, P, a);
    createFlowField(7)(1.5, -2.5, P, b);
    expect(a).toEqual(b);

    createFlowField(8)(1.5, -2.5, P, b);
    expect(Math.hypot(a.vx - b.vx, a.vy - b.vy)).toBeGreaterThan(1e-6);
  });

  it('produces a non-trivial field that responds to warp', () => {
    const field = createFlowField(42);
    const calm: FlowVector = { vx: 0, vy: 0 };
    const rough: FlowVector = { vx: 0, vy: 0 };
    let totalDiff = 0;
    let totalMag = 0;
    for (let i = 0; i < 20; i++) {
      const x = -10 + i * 1.05;
      const y = Math.sin(i * 2.3) * 7;
      field(x, y, { ...P, warp: 0 }, calm);
      field(x, y, { ...P, warp: 1 }, rough);
      totalMag += Math.hypot(calm.vx, calm.vy);
      totalDiff += Math.hypot(rough.vx - calm.vx, rough.vy - calm.vy);
    }
    expect(totalMag).toBeGreaterThan(0.05);
    expect(totalDiff).toBeGreaterThan(0.05);
  });

  it('defines a character for every movement phase', () => {
    for (const phase of ['drift', 'gather', 'bloom', 'hang', 'dissolve', 'exhale'] as const) {
      const c = flowCharacterFor(phase);
      expect(c.scale).toBeGreaterThan(0);
      expect(c.evolveRate).toBeGreaterThan(0);
      expect(c.warp).toBeGreaterThanOrEqual(0);
    }
  });
});
