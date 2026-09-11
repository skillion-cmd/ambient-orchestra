import * as THREE from 'three';

/**
 * Harmonic chroma — the one place the field is allowed any colour.
 *
 * The Art Director has always computed a mood from the harmony (tonic
 * warms, dominant and colour chords cool, brightness nudges warmer),
 * smoothed it over about six seconds, and drifted it back to neutral in the
 * corridor between rooms. Until now it reached the screen as a ±0.04 nudge
 * to the red channel of the ghost fog colour — and the point shader reads
 * only that channel, as a grey. So the mood survived as a faint shift in
 * fog *brightness*, and the scope's COOL/WARM meter was reporting a
 * quantity the field could not show. This is that channel made real.
 *
 * It is chromesthesia at the level of the chord rather than the note. A
 * note-to-hue mapping would be a different instrument: it would put colour
 * on every event, and the restraint of the monochrome field is most of what
 * makes it read as ink and weather and sand rather than as a visualiser.
 * A chord function changing the colour of the light in the room is the same
 * idea at the altitude the rest of the system already works at — and it is
 * the one channel all three visuals genuinely share, since all three read
 * the same harmonic context.
 *
 * Hence the ceiling. These offsets are added to a 0–1 tone, so the whole
 * range end to end is about three percent of the field's dynamic range —
 * under the threshold where a reader would name a colour, which is the
 * intent. Warm goes amber, cool goes blue-violet, and green barely moves in
 * either direction, because the eye reads a green shift as the display
 * being wrong rather than as the light having changed.
 */

/** Largest single-channel offset any mood can produce. */
export const CHROMA_CEILING = 0.034;

const WARM = new THREE.Vector3(0.032, 0.008, -0.03);
const COOL = new THREE.Vector3(-0.022, -0.006, 0.034);

/**
 * The chroma offset for a mood in -1 (cool) .. +1 (warm). Signed, so it is
 * a Vector3 rather than a Color — a Color is a colour, and this is a
 * direction to move one.
 */
export function moodChroma(mood: number, out: THREE.Vector3): THREE.Vector3 {
  const m = Math.max(-1, Math.min(1, mood));
  if (m >= 0) out.copy(WARM).multiplyScalar(m);
  else out.copy(COOL).multiplyScalar(-m);
  return out;
}
