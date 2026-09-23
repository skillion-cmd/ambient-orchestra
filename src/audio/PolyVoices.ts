import * as Tone from 'tone';
import type { Monophonic } from 'tone/build/esm/instrument/Monophonic';

/** Any PolySynth voice — `any` is PolySynth's own constraint on it. */
export type AnyVoice = Monophonic<any>;

/**
 * Re-striking a PolySynth without losing notes to its own release tails.
 *
 * Every pad here changes chord the same way: `releaseAll()`, then attack the
 * new voicing, so the old chord's long release (12–20s) crossfades under the
 * new one's attack. But a PolySynth only gets a voice back once its release
 * has run all the way out, and it never steals — past `maxPolyphony` it
 * drops the note with a console warning and carries on. A release is a voice
 * in use for its whole length, so a re-strike needs *twice* the voicing in
 * voices, and the pads were sized for one: the orchestra's three-octave stack
 * is up to thirteen notes against a limit of fourteen, the harmony bed eight
 * against ten. Measured over ninety seconds of a night piece, forty-two
 * notes were dropped this way, all from ensemble cues on those pads — whole
 * chord tones vanishing at exactly the moment the ensemble was meant to
 * swell, which is what "the sound drops" was.
 *
 * Raising the limits would double what the heaviest pads cost the audio
 * thread (each voice of the stacks is three detuned saws and a filter), and
 * an audio thread that runs out of time drops *everything*, briefly. So the
 * shortfall is taken from the voices that are on their way out instead:
 * first one already on the same pitch, which just swells back up from where
 * its release had got to, then the oldest, which is the quietest. Voices
 * that are free are used first, so wherever there was room nothing about
 * how these sound has changed.
 */

/** A voice PolySynth is holding: what it was struck on, and the voice. */
interface ActiveVoice {
  midi: number;
  voice: AnyVoice;
  released: boolean;
}

/**
 * The parts of PolySynth this needs that it does not expose. The public
 * surface has `activeVoices` (a count) and nothing that lets a caller reuse
 * a voice, and what is here is exactly the book-keeping `_triggerAttack`
 * itself does — kept in one place so a Tone upgrade breaks one function.
 */
interface PolySynthInternals {
  maxPolyphony: number;
  _voices: unknown[];
  _availableVoices: unknown[];
  _activeVoices: ActiveVoice[];
}

/**
 * Which held voices to re-strike, and which notes still need fresh ones.
 *
 * `held` is the midi note of every voice PolySynth is holding, oldest first
 * — which is the order it keeps them in. Returned pairs are
 * `[heldIndex, noteIndex]`. Pure, so the choice can be tested without an
 * audio context.
 */
export function planSteals(
  held: readonly number[],
  free: number,
  notes: readonly number[],
): { steals: [number, number][]; fresh: number[] } {
  const shortfall = Math.max(0, notes.length - Math.max(0, free));
  const steals: [number, number][] = [];
  if (shortfall === 0) return { steals, fresh: notes.map((_, i) => i) };

  const taken = new Set<number>();
  const stolenNotes = new Set<number>();

  // Same pitch first: that voice only has to swell back up, so the note
  // re-articulates rather than jumping.
  for (let n = 0; n < notes.length && steals.length < shortfall; n++) {
    const h = held.findIndex((midi, i) => midi === notes[n] && !taken.has(i));
    if (h === -1) continue;
    taken.add(h);
    stolenNotes.add(n);
    steals.push([h, n]);
  }

  // Then the oldest, for whatever is still short — from the top of the
  // voicing down, so if anything has to jump pitch it is the highest notes
  // on the oldest tails rather than the root.
  for (let n = notes.length - 1; n >= 0 && steals.length < shortfall; n--) {
    if (stolenNotes.has(n)) continue;
    const h = held.findIndex((_, i) => !taken.has(i));
    if (h === -1) break;
    taken.add(h);
    stolenNotes.add(n);
    steals.push([h, n]);
  }

  const fresh = notes.map((_, i) => i).filter((i) => !stolenNotes.has(i));
  return { steals, fresh };
}

/**
 * Attack `notes` on `synth`, re-striking held voices for whatever does not
 * fit in the free ones. Call it after `releaseAll()` (or, for a keyboard, on
 * any note-on — released tails are taken before held notes), at a time from the
 * voice's own `ScheduleTime` — that is what guarantees a re-struck voice is
 * started strictly after it last was, which Tone asserts.
 */
export function attackWithSteal<V extends AnyVoice>(
  synth: Tone.PolySynth<V>,
  notes: readonly string[],
  time: number,
  velocity: number,
): void {
  const poly = synth as unknown as PolySynthInternals;
  const midis = notes.map((n) => Tone.Frequency(n).toMidi());
  const free = poly._availableVoices.length + Math.max(0, poly.maxPolyphony - poly._voices.length);
  // A voice whose release has already run out is about to be handed back by
  // PolySynth itself, and re-striking it would race that hand-back — it could
  // then be given to a second note while still playing this one. Only voices
  // still audibly on their way out are stealable. Released voices go ahead of
  // held ones, each group oldest first, so a note still under a finger (play
  // mode) is only taken when every tail has already been used.
  const audible = poly._activeVoices.filter((v) => v.voice.getLevelAtTime(time) > 1e-4);
  const candidates = [...audible.filter((v) => v.released), ...audible.filter((v) => !v.released)];
  const { steals, fresh } = planSteals(
    candidates.map((v) => v.midi),
    free,
    midis,
  );

  // Re-strike, then move each re-struck voice to the back of the list: it is
  // the newest note now, and the next steal should take it last. This is
  // Tone's own legato path — `Source.start` on a playing oscillator cancels
  // its pending stop rather than starting a second one, so the voice is never
  // reported silent and handed out twice.
  const restruck: ActiveVoice[] = [];
  for (const [h, n] of steals) {
    const entry = candidates[h]!;
    entry.voice.triggerAttack(notes[n]!, time, velocity);
    entry.midi = midis[n]!;
    entry.released = false;
    restruck.push(entry);
  }
  if (restruck.length) {
    poly._activeVoices = poly._activeVoices.filter((v) => !restruck.includes(v)).concat(restruck);
  }

  if (fresh.length) synth.triggerAttack(fresh.map((i) => notes[i]!), time, velocity);
}
