import { describe, expect, it, vi } from 'vitest';
import { HarmonicField } from './HarmonicField';
import { MusicalClock } from './MusicalClock';
import type { SoundKnobs } from './types';
import { DEFAULT_KNOBS } from './types';

const KNOBS: SoundKnobs = { ...DEFAULT_KNOBS.sound };

function mockClock(): MusicalClock {
  return {
    update: () => {},
    isNewBar: () => false,
    isDownbeat: () => false,
    beatDurationSec: () => 1.03,
    harmonicBeatScale: () => 1,
    beatPulse: 0,
    playPulse: 0,
    currentBar: 0,
    beatInBar: 0,
    subdivision: 0,
    init: () => {},
  } as MusicalClock;
}

describe('HarmonicField', () => {
  it('starts in drift phase with low density', () => {
    const field = new HarmonicField();
    expect(field.getMovementDensity()).toBeLessThan(0.4);
  });

  it('emits transition bloom after crossfade completes', () => {
    const field = new HarmonicField();
    const clock = mockClock();

    field.skipToNextMovement(KNOBS);
    expect(field.isHarmonicTransitioning()).toBe(true);
    expect(field.consumeTransitionBloom()).toBe(false);

    // The crossfade scales with the incoming movement's length now, so run
    // until it settles rather than for a fixed window. The cap stays well
    // under the shortest movement, so nothing can begin a second one here.
    let steps = 0;
    while (field.isHarmonicTransitioning() && steps < 1000) {
      field.advance(0.05, clock, KNOBS);
      steps++;
    }

    expect(field.isHarmonicTransitioning()).toBe(false);
    expect(field.consumeTransitionBloom()).toBe(true);
    expect(field.consumeTransitionBloom()).toBe(false);
  });

  it('emits phrase cadence when melody phrase wraps', () => {
    const field = new HarmonicField();
    const clock = mockClock();

    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    let cadence: string | null = null;
    for (let i = 0; i < 800 && !cadence; i++) {
      field.advance(0.05, clock, { ...KNOBS, memory: 0.9 });
      cadence = field.consumePhraseCadence();
    }

    expect(cadence).toBeTruthy();
    vi.restoreAllMocks();
  });

  it('advanceToNextPhase walks movement arc', () => {
    const field = new HarmonicField();
    expect(field.advanceToNextPhase()).toBe('gather');
    expect(field.advanceToNextPhase()).toBe('bloom');
  });
});

/**
 * A clock whose beats are short and whose bars tick, so both grids the field
 * acts on arrive in a handful of simulated seconds rather than most of a
 * movement. What is under test is what happens *at* a boundary, not how long
 * the field takes to reach one.
 */
function fastClock(barEvery = 12): MusicalClock {
  let ticks = 0;
  return {
    ...mockClock(),
    beatDurationSec: () => 0.05,
    update: () => {
      ticks++;
    },
    isNewBar: () => ticks % barEvery === 0,
  } as MusicalClock;
}


function advance(field: HarmonicField, seconds: number, clock: MusicalClock): void {
  for (let t = 0; t < seconds; t += 1 / 60) field.advance(1 / 60, clock, KNOBS);
}

/**
 * Advance until `predicate` holds, returning whether it ever did.
 *
 * An answer is a passing event, not a resting state: the melody voice plays
 * the player's line through and then goes on composing, so a test that looks
 * once at the end sees whatever the field drifted to afterwards.
 */
function advanceUntil(
  field: HarmonicField,
  clock: MusicalClock,
  predicate: () => boolean,
  seconds = 20,
): boolean {
  for (let t = 0; t < seconds; t += 1 / 60) {
    field.advance(1 / 60, clock, KNOBS);
    if (predicate()) return true;
  }
  return false;
}

describe('HarmonicField following the player', () => {
  it('does not move the ensemble the instant a chord goes down', () => {
    // The lag is the design: the ensemble arrives on a bar line, together,
    // rather than lurching the beds under your fingers.
    const field = new HarmonicField();
    const clock = fastClock(1000);
    const before = field.current(clock).chordDegrees;
    field.followChord([1, 3, 5], true, 1);
    advance(field, 0.05, clock);
    expect(field.current(clock).chordDegrees).toEqual(before);
    expect(field.isFollowingPlayer()).toBe(false);
  });

  it('takes a firmly held chord on the next bar', () => {
    const field = new HarmonicField();
    const clock = fastClock();
    field.followChord([3, 5, 0], true, 1);
    // Comfortably inside one bar of this clock, and far short of a phrase.
    advance(field, 0.25, clock);
    expect(field.isFollowingPlayer()).toBe(true);
    expect(field.current(clock).chordDegrees).toEqual([0, 3, 5]);
  });

  it('holds a taken chord without re-firing a cadence every bar', () => {
    // takeLead runs on every bar for as long as the shape is held, so the
    // ensemble already being on the chord has to be a no-op — otherwise a
    // held chord fires a cadence ripple every four seconds.
    const field = new HarmonicField();
    // Bars tick briskly, melody notes crawl: many bar lines, no phrase
    // boundaries, so every cadence counted here came from the lead.
    const clock = { ...fastClock(6), beatDurationSec: () => 5 } as MusicalClock;
    field.followChord([3, 5, 0], true, 1);
    let cadences = 0;
    for (let i = 0; i < 120; i++) {
      field.advance(1 / 60, clock, KNOBS);
      field.followChord([3, 5, 0], true, 1);
      if (field.consumePhraseCadence()) cadences++;
    }
    expect(field.isFollowingPlayer()).toBe(true);
    expect(cadences).toBe(1);
  });

  it('does not let the walk steal the chord back while the lead still stands', () => {
    // The walk changes chord at phrase boundaries. A lead whose wait is
    // already up has to survive them, or holding a shape would give you the
    // ensemble for a few bars and then quietly lose it again.
    const field = new HarmonicField();
    const clock = fastClock();
    field.followChord([3, 5, 0], true, 1);
    advance(field, 0.25, clock);
    expect(field.isFollowingPlayer()).toBe(true);
    for (let i = 0; i < 40; i++) {
      advance(field, 1, clock);
      field.followChord([3, 5, 0], true, 1);
      expect(field.isFollowingPlayer()).toBe(true);
      expect(field.current(clock).chordDegrees).toEqual([0, 3, 5]);
    }
  });

  it('never takes a shape the hands have not settled on', () => {
    // A run through a chord on the way somewhere else is not an instruction.
    const field = new HarmonicField();
    const clock = fastClock();
    field.followChord([1, 3, 5], false, 1);
    advance(field, 30, clock);
    expect(field.isFollowingPlayer()).toBe(false);
  });

  it('makes a patient blend wait more bars than an eager one', () => {
    const eager = new HarmonicField();
    const eagerClock = fastClock();
    eager.followChord([3, 5, 0], true, 1);
    advance(eager, 0.25, eagerClock);
    expect(eager.isFollowingPlayer()).toBe(true);

    const patient = new HarmonicField();
    const patientClock = fastClock();
    patient.followChord([3, 5, 0], true, 4);
    advance(patient, 0.25, patientClock);
    expect(patient.isFollowingPlayer()).toBe(false);
    advance(patient, 0.75, patientClock);
    expect(patient.isFollowingPlayer()).toBe(true);
  });

  it('restarts the wait when the hands move to a new shape', () => {
    const field = new HarmonicField();
    const clock = fastClock();
    field.followChord([0, 2, 4], true, 3);
    advance(field, 0.4, clock);
    expect(field.isFollowingPlayer()).toBe(false);
    // A different shape is a different instruction — it does not inherit the
    // bars the previous one had already served.
    field.followChord([1, 3, 5], true, 3);
    advance(field, 0.4, clock);
    expect(field.isFollowingPlayer()).toBe(false);
  });

  it('hands the walk back when the lead is released', () => {
    const field = new HarmonicField();
    const clock = fastClock();
    field.followChord([0, 2, 4], true, 1);
    advance(field, 0.25, clock);
    expect(field.isFollowingPlayer()).toBe(true);
    field.followChord([], false, 1);
    // Long enough for the walk to reach a phrase boundary and choose again.
    advance(field, 40, clock);
    expect(field.isFollowingPlayer()).toBe(false);
  });

  it('names the function of a chord it took, so the walk resumes from it', () => {
    // Otherwise the next machine-chosen chord picks its transition from
    // whatever the function was several chords ago.
    const field = new HarmonicField();
    const clock = fastClock();
    field.followChord([4], true, 1);
    advance(field, 0.25, clock);
    expect(field.current(clock).chordFunction).toBe('dominant');
  });

  it('answers a finished phrase at the next boundary', () => {
    const field = new HarmonicField();
    const clock = fastClock();
    field.answerPhrase([2, 4, 1, 5]);
    const answered = advanceUntil(
      field,
      clock,
      () => field.current(clock).melodyPhraseType === 'recall',
    );
    expect(answered).toBe(true);
  });

  it('keeps the answered phrase as the hook it can bring back later', () => {
    const field = new HarmonicField();
    const clock = fastClock();
    const phrase = [2, 4, 1, 5];
    field.answerPhrase(phrase);
    advanceUntil(field, clock, () => field.current(clock).melodyPhraseType === 'recall');
    // The recall is generated from the player's line, so their degrees are
    // what the melody voice is working with rather than a fresh phrase.
    const degrees = field.current(clock).melodyDegrees;
    expect(degrees.length).toBeGreaterThan(0);
    expect(degrees.some((d) => phrase.includes(d))).toBe(true);
  });

  it('clears both the lead and the answer on leaving play mode', () => {
    const field = new HarmonicField();
    const clock = fastClock();
    field.followChord([0, 2, 4], true, 1);
    field.answerPhrase([1, 3, 5]);
    field.clearPlayerLead();
    advance(field, 20, clock);
    expect(field.isFollowingPlayer()).toBe(false);
    expect(field.current(clock).melodyPhraseType).not.toBe('recall');
  });
});
