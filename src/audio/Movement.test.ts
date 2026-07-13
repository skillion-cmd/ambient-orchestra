import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  Movement,
  pickMovementVariant,
  type MovementVariant,
} from './Movement';

const VARIANTS: MovementVariant[] = ['classic', 'doubleBloom', 'longHang', 'noBloom'];

describe('buildTimeline', () => {
  it('every variant starts with drift at 0, ends with exhale, includes dissolve', () => {
    for (const variant of VARIANTS) {
      const timeline = buildTimeline(variant);
      expect(timeline[0]).toEqual({ phase: 'drift', start: 0 });
      expect(timeline[timeline.length - 1]!.phase).toBe('exhale');
      expect(timeline.some((s) => s.phase === 'dissolve')).toBe(true);
    }
  });

  it('segment starts are strictly monotonic within [0, 1)', () => {
    for (const variant of VARIANTS) {
      const timeline = buildTimeline(variant);
      for (let i = 0; i < timeline.length; i++) {
        expect(timeline[i]!.start).toBeGreaterThanOrEqual(0);
        expect(timeline[i]!.start).toBeLessThan(1);
        if (i > 0) expect(timeline[i]!.start).toBeGreaterThan(timeline[i - 1]!.start);
      }
    }
  });

  it('classic matches the legacy phase breakpoints exactly', () => {
    expect(buildTimeline('classic')).toEqual([
      { phase: 'drift', start: 0 },
      { phase: 'gather', start: 0.18 },
      { phase: 'bloom', start: 0.35 },
      { phase: 'hang', start: 0.58 },
      { phase: 'dissolve', start: 0.72 },
      { phase: 'exhale', start: 0.88 },
    ]);
  });

  it('noBloom never enters bloom; doubleBloom enters it twice', () => {
    expect(buildTimeline('noBloom').every((s) => s.phase !== 'bloom')).toBe(true);
    expect(buildTimeline('doubleBloom').filter((s) => s.phase === 'bloom')).toHaveLength(2);
  });
});

describe('Movement', () => {
  it('advance walks the doubleBloom sequence including both blooms', () => {
    const m = new Movement(0, 'doubleBloom');
    const seen: string[] = [];
    const step = m.durationSec / 400;
    for (let i = 0; i < 400; i++) {
      m.advance(step);
      if (seen[seen.length - 1] !== m.phase) seen.push(m.phase);
    }
    expect(seen).toEqual([
      'drift',
      'gather',
      'bloom',
      'hang',
      'bloom',
      'hang',
      'dissolve',
      'exhale',
    ]);
  });

  it('advanceToNextPhase visits every segment in order and then returns null', () => {
    for (const variant of VARIANTS) {
      const m = new Movement(0, variant);
      const timeline = buildTimeline(variant);
      for (let i = 1; i < timeline.length; i++) {
        expect(m.advanceToNextPhase()).toBe(timeline[i]!.phase);
      }
      expect(m.advanceToNextPhase()).toBeNull();
    }
  });

  it('jumpToPhase(bloom) from the first doubleBloom hang moves forward to the second bloom', () => {
    const m = new Movement(0, 'doubleBloom');
    m.jumpToPhase('hang'); // lands on the first hang (start 0.42)
    const elapsedAtHang = m.elapsed;
    m.jumpToPhase('bloom');
    expect(m.phase).toBe('bloom');
    expect(m.elapsed).toBeGreaterThan(elapsedAtHang);
    expect(m.progress()).toBeGreaterThan(0.55 - 0.01); // the 0.55 bloom, not 0.26
  });

  it('jumpToPhase(dissolve) works from drift on every variant', () => {
    for (const variant of VARIANTS) {
      const m = new Movement(0, variant);
      expect(m.jumpToPhase('dissolve')).toBe('dissolve');
      expect(m.phase).toBe('dissolve');
    }
  });

  it('defaults to the classic variant', () => {
    expect(new Movement(0).variant).toBe('classic');
  });
});

describe('pickMovementVariant', () => {
  it('never repeats the previous variant', () => {
    for (const prev of VARIANTS) {
      for (let i = 0; i < 300; i++) {
        expect(pickMovementVariant(prev)).not.toBe(prev);
      }
    }
  });

  it('returns valid variants and favors classic when available', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const v = pickMovementVariant('noBloom');
      expect(VARIANTS).toContain(v);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    expect(counts['classic']!).toBeGreaterThan(counts['doubleBloom']!);
    expect(counts['classic']!).toBeGreaterThan(counts['longHang']!);
  });
});
