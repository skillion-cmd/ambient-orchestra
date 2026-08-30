import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  EPIC_SPACING,
  Movement,
  MOVEMENT_SCALES,
  pickMovementScale,
  pickMovementVariant,
  pickPulseProfile,
  type MovementScale,
  type MovementVariant,
} from './Movement';

const VARIANTS: MovementVariant[] = [
  'classic',
  'doubleBloom',
  'longHang',
  'noBloom',
  'tripleWave',
];

describe('buildTimeline', () => {
  it('every variant at every scale starts with drift at 0, ends with exhale, includes dissolve', () => {
    for (const variant of VARIANTS) {
      for (const scale of MOVEMENT_SCALES) {
        const timeline = buildTimeline(variant, scale);
        expect(timeline[0]).toEqual({ phase: 'drift', start: 0 });
        expect(timeline[timeline.length - 1]!.phase).toBe('exhale');
        expect(timeline.some((s) => s.phase === 'dissolve')).toBe(true);
      }
    }
  });

  it('segment starts are strictly monotonic within [0, 1)', () => {
    for (const variant of VARIANTS) {
      for (const scale of MOVEMENT_SCALES) {
        const timeline = buildTimeline(variant, scale);
        for (let i = 0; i < timeline.length; i++) {
          expect(timeline[i]!.start).toBeGreaterThanOrEqual(0);
          expect(timeline[i]!.start).toBeLessThan(1);
          if (i > 0) expect(timeline[i]!.start).toBeGreaterThan(timeline[i - 1]!.start);
        }
      }
    }
  });

  it('a fragment compresses to at most four segments, whatever the variant', () => {
    for (const variant of VARIANTS) {
      expect(buildTimeline(variant, 'fragment').length).toBeLessThanOrEqual(5);
      // and is shorter than the same variant at full scale
      expect(buildTimeline(variant, 'fragment').length).toBeLessThanOrEqual(
        buildTimeline(variant, 'standard').length,
      );
    }
  });

  it('tripleWave crests three times', () => {
    expect(buildTimeline('tripleWave', 'epic').filter((s) => s.phase === 'bloom')).toHaveLength(3);
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
        expect(pickMovementVariant(prev, 'epic')).not.toBe(prev);
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

  it('only offers tripleWave to scales long enough to walk it', () => {
    for (let i = 0; i < 500; i++) {
      expect(pickMovementVariant(null, 'fragment')).not.toBe('tripleWave');
      expect(pickMovementVariant(null, 'short')).not.toBe('tripleWave');
      expect(pickMovementVariant(null, 'standard')).not.toBe('tripleWave');
    }
    const wide = new Set<MovementVariant>();
    for (let i = 0; i < 500; i++) wide.add(pickMovementVariant(null, 'epic'));
    expect(wide.has('tripleWave')).toBe(true);
  });
});

describe('pickMovementScale', () => {
  it('never repeats the previous scale', () => {
    for (const prev of MOVEMENT_SCALES) {
      for (let i = 0; i < 300; i++) {
        expect(pickMovementScale(prev, 99)).not.toBe(prev);
      }
    }
  });

  it('holds the epic back until enough movements have passed', () => {
    for (let since = 0; since < EPIC_SPACING; since++) {
      for (let i = 0; i < 300; i++) {
        expect(pickMovementScale('standard', since)).not.toBe('epic');
      }
    }
    const seen = new Set<MovementScale>();
    for (let i = 0; i < 500; i++) seen.add(pickMovementScale('standard', EPIC_SPACING));
    expect(seen.has('epic')).toBe(true);
  });

  it('reaches every scale, and the spread really does vary duration', () => {
    const durations = MOVEMENT_SCALES.map(
      (scale) => new Movement(0, 'classic', scale).durationSec,
    );
    // A fragment is under two minutes; an epic is over twenty.
    expect(Math.min(...durations)).toBeLessThan(120);
    expect(Math.max(...durations)).toBeGreaterThan(1200);
  });
});

describe('pickPulseProfile', () => {
  it('never gives a fragment a full kit — no room to establish one and leave', () => {
    for (let i = 0; i < 500; i++) {
      expect(pickPulseProfile('fragment', 1, 1)).not.toBe('kit');
    }
  });

  it('leaves roughly half of movements with no beat at all', () => {
    let silent = 0;
    const runs = 4000;
    for (let i = 0; i < runs; i++) {
      if (pickPulseProfile('standard', 0.5, 0.35) === 'silent') silent++;
    }
    const share = silent / runs;
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.7);
  });

  it('the Tempo knob pushes movements toward a kit', () => {
    const kitsAt = (pulse: number): number => {
      let kits = 0;
      for (let i = 0; i < 3000; i++) {
        if (pickPulseProfile('standard', pulse, 0.5) === 'kit') kits++;
      }
      return kits;
    };
    expect(kitsAt(1)).toBeGreaterThan(kitsAt(0));
  });
});
