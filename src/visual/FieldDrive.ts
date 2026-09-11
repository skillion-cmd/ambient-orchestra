import type { HarmonicContext, VisualKnobs } from '../audio/types';
import type { ArtDirectorDirectives } from './ArtDirectorSkill';

/**
 * One reading of the piece, shared by all three visuals.
 *
 * Before this, each field listened for its own subset of the engine. Ink
 * answered cadences, constellations and the two breath gestures; Currents
 * folded the ensemble and the beat into a single gust; Resonance took a
 * strike from the gesture id and nothing else. The same musical moment
 * therefore landed in all three only by accident, and two of the Art
 * Director's four directives — the focus arc and the fog breathing —
 * reached the ink field alone, so its dreamlike drift and the doorway snap
 * were simply absent everywhere else.
 *
 * The fix is not to make the three look alike. It is to give them one
 * vocabulary and let each answer it in its own terms: switching mode should
 * change the noun, not the language. A phrase closing is a ring through the
 * ink, a band crossing the wind map, and a softer second strike on the
 * plate — one event, three readings.
 */
export interface FieldDrive {
  /** Focus after the Art Director's arc — the knob is only half of it. */
  focus: number;
  /** Fog depth: the knob riding over the director's phase breathing. */
  fog: number;
  /** Palette mood, -1 cool .. +1 warm. */
  mood: number;
  /** The field's overall breath (quiet retracts, loud expands). */
  breathe: number;
  /** The ensemble arriving together, decaying (0–1). */
  strike: number;
  /** Increments when a new strike begins — for fields that want the edge. */
  strikeId: number;
  /** A phrase closing (0–1). */
  ripple: number;
  /** The breath drawn before a gesture — everything contracts (0–1). */
  inhale: number;
  /** The field thrown open — everything expands (0–1). */
  expand: number;
  /** Crossing between the two rooms (0–1). */
  doorway: number;
}

const NEUTRAL_ART: ArtDirectorDirectives = {
  fogMultiplier: 1,
  focusOffset: 0,
  moodBlend: 0,
  constellationTrigger: false,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Reads the engine once a frame and hands every field the same drive.
 *
 * Only `strike` needs state kept here: the engine publishes it as a gesture
 * id rather than a level, and a field wanting the envelope rather than the
 * edge would otherwise have to build its own — which is exactly how the
 * three ended up disagreeing about what an ensemble swell looks like.
 */
export class FieldDriveSource {
  private strike = 0;
  private strikeId = 0;
  /**
   * The engine's gesture id starts at 0, so a source that began at -1 would
   * read the first frame of every session as a strike the ensemble never
   * played. The first update adopts what it finds instead of answering it.
   */
  private primed = false;
  private lastGestureId = 0;
  private lastDoorway = 0;

  update(
    ctx: HarmonicContext,
    knobs: VisualKnobs,
    art: ArtDirectorDirectives = NEUTRAL_ART,
    breathe = 0.5,
    dt = 1 / 60,
  ): FieldDrive {
    if (!this.primed) {
      this.primed = true;
      this.lastGestureId = ctx.gestureId;
      this.lastDoorway = ctx.doorwayPulse;
    } else if (ctx.gestureId !== this.lastGestureId) {
      this.lastGestureId = ctx.gestureId;
      this.strikeId++;
      this.strike = Math.min(1, this.strike + ctx.ensemblePulse * 0.8 + 0.2);
    }

    // Walking through the doorway is the largest strike the piece has — the
    // moment the room you were in becomes the room you were listening to.
    // It was previously a camera snap in Ink, a mild gust in Currents and a
    // floor under the plate's agitation in Resonance; here it is one event
    // that all three are told about.
    if (ctx.doorwayPulse > 0.9 && this.lastDoorway <= 0.5) {
      this.strikeId++;
      this.strike = 1;
    }
    this.lastDoorway = ctx.doorwayPulse;

    // Decays over about a second, but never falls below what the beat and
    // the doorway are holding up — a strike is the ensemble arriving, and on
    // a movement with a kit it arrives on every downbeat.
    this.strike = Math.max(
      0,
      Math.max(this.strike - dt * 0.9, ctx.beatPulse * 0.45 + ctx.doorwayPulse * 0.7),
    );

    return {
      focus: clamp01(knobs.focus + art.focusOffset),
      fog: art.fogMultiplier * (0.5 + knobs.fog),
      mood: art.moodBlend,
      breathe,
      strike: Math.min(1, this.strike),
      strikeId: this.strikeId,
      ripple: ctx.cadenceRipple,
      inhale: ctx.inhaleGesture,
      // A chord you played reaches the field the same way the ensemble's own
      // space throw does. `playPulse` has been on the context since Play
      // shipped and no visual has ever read it, so until now playing the
      // instrument was the one thing in the room that left no mark on it.
      expand: Math.min(1, ctx.spaceThrowGesture + ctx.playPulse * 0.7),
      doorway: ctx.doorwayPulse,
    };
  }
}
