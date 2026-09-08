/**
 * What the hands are asking for, in the ensemble's own terms.
 *
 * The instrument speaks in keys and pitches; the Conductor thinks in scale
 * degrees, chord functions and phrases. This is the translation layer between
 * them, and it exists because Play mode's whole premise is that the orchestra
 * is listening — and something has to decide what "listening" heard.
 *
 * Two readings come out of it, and the difference between them is the whole
 * design:
 *
 * - **A chord**, which only forms when you *hold* a shape. Confidence rises
 *   while the held degrees stay unchanged and resets the moment they don't,
 *   so a run of passing notes never reads as an instruction. Conducting is
 *   holding a shape and waiting; noodling is not, and the ensemble should be
 *   able to tell them apart without being told.
 * - **A phrase**, which only forms when you *stop*. The line you just played
 *   is offered up once, after enough silence to be sure you finished it, for
 *   the melody voice to answer.
 *
 * Both are offers, not commands. Nothing here writes to the field; it only
 * says what it heard, and `HarmonicField` decides on its own clock what to do
 * about it.
 */

/** A chord the hands have settled on, in scale-degree indices. */
export interface ChordIntent {
  /** Degrees for the ensemble to voice, low to high. */
  degrees: number[];
  /** 0–1 — how long this exact shape has been held, normalised. */
  confidence: number;
}

/**
 * How long one unchanged shape must be held before it reads as a statement.
 *
 * Short enough that holding a chord and waiting feels answered rather than
 * ignored; long enough that walking up through a chord on the way somewhere
 * else never trips it, since every note added restarts the count.
 */
const SETTLE_SEC = 1.1;

/** Silence that ends a phrase — shorter than this is a gap between notes. */
const PHRASE_REST_SEC = 1.5;

/** Below this a phrase is an accident; above it, an idea. */
const PHRASE_MIN_NOTES = 3;

/** The melody voice reads a hook of four; a few more gives it something to cut. */
const PHRASE_MAX_NOTES = 8;

/** At most this many voices go to the ensemble — a held cluster is not a chord. */
const MAX_CHORD_TONES = 4;

export class PlayIntent {
  /** Physical key → the scale degree it sounded. */
  private readonly held = new Map<number, number>();
  /** Signature of the currently held shape, for spotting a change. */
  private shape = '';
  /** Seconds the shape has been unchanged. */
  private settledFor = 0;
  /** Degrees played since the last rest, oldest first. */
  private phrase: number[] = [];
  /** Seconds since the last note lifted, while nothing is held. */
  private restFor = 0;
  /** A finished phrase waiting to be collected, offered exactly once. */
  private finished: number[] | null = null;

  /** A key spoke. `degree` is the scale degree it actually sounded. */
  noteOn(key: number, degree: number): void {
    this.held.set(key, degree);
    this.phrase.push(degree);
    if (this.phrase.length > PHRASE_MAX_NOTES) this.phrase.shift();
    this.restFor = 0;
    this.syncShape();
  }

  /**
   * A key released. Called when the note actually stops being held — a note
   * the sustain pedal is still carrying stays in the shape, because it is
   * still sounding and the ensemble can still hear it.
   */
  noteOff(key: number): void {
    if (!this.held.delete(key)) return;
    this.syncShape();
  }

  update(dt: number): void {
    const step = Math.max(0, dt);
    if (this.held.size > 0) {
      this.settledFor += step;
      return;
    }
    this.restFor += step;
    if (this.restFor >= PHRASE_REST_SEC && this.phrase.length >= PHRASE_MIN_NOTES) {
      this.finished = [...this.phrase];
      this.phrase = [];
    }
  }

  /**
   * The chord being asked for, or null if nothing is being held.
   *
   * A single held degree still returns a chord: you indicate a root and the
   * ensemble voices it, which is the difference between conducting and
   * playing every note yourself.
   */
  readChord(): ChordIntent | null {
    if (this.held.size === 0) return null;
    const distinct = [...new Set(this.held.values())].sort((a, b) => a - b);
    const degrees =
      distinct.length === 1
        ? [distinct[0]!, distinct[0]! + 2, distinct[0]! + 4]
        : distinct.slice(0, MAX_CHORD_TONES);
    return {
      degrees,
      confidence: Math.min(1, this.settledFor / SETTLE_SEC),
    };
  }

  /** The last finished phrase, if one is waiting. Yields it once. */
  takePhrase(): number[] | null {
    const phrase = this.finished;
    this.finished = null;
    return phrase;
  }

  /** Leaving play mode, or a controller vanishing mid-chord. */
  clear(): void {
    this.held.clear();
    this.phrase = [];
    this.finished = null;
    this.shape = '';
    this.settledFor = 0;
    this.restFor = 0;
  }

  /** Restart the settle clock whenever the held shape actually changes. */
  private syncShape(): void {
    const next = [...new Set(this.held.values())].sort((a, b) => a - b).join(',');
    if (next === this.shape) return;
    this.shape = next;
    this.settledFor = 0;
  }
}
