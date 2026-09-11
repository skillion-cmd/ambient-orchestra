/**
 * Which layer holds the foreground.
 *
 * Ambient swell isn't a volume knob — it's the ambient curves carrying
 * everything one minute and sitting barely audible under a melody or a
 * texture the next. A focus point wanders a small 2-D layer space; each
 * layer's presence falls off with its distance from that point, and the
 * set is scaled so whichever layer is nearest sits at full presence. The
 * balance rotates continuously; the front never goes empty.
 */

export const PRESENCE_LAYERS = ['pad', 'melody', 'air', 'sub', 'pulse'] as const;

export type PresenceLayer = (typeof PRESENCE_LAYERS)[number];

export type LayerPresence = Record<PresenceLayer, number>;

/**
 * Almost gone, but never gone — a layer recedes rather than drops out.
 * Deep enough (about -22dB) that a receded layer reads as absent rather
 * than as quiet: in Parallel 1 the ambient curves vanish under the other
 * elements, they don't just duck.
 */
export const PRESENCE_MIN = 0.08;
/** The front of the mix. Some layer is always here. */
export const PRESENCE_MAX = 1.15;

/**
 * How far back each layer is allowed to fall.
 *
 * Not one floor for everything, because the layers don't mean the same
 * thing. A pad receding to -22dB is the piece breathing out — you hear the
 * room open up and you never notice the pad has gone. A *beat* receding to
 * -22dB is not a quieter beat, it is the groove stopping: the pulse you
 * were keeping time by disappears for a couple of minutes and then walks
 * back in, and the piece reads as having lost the thread rather than as
 * having moved its attention. The sub is the same argument one step down —
 * it is the floor the rest of the mix stands on.
 *
 * So the rhythmic layers recede to something you can still feel (-8dB for
 * the beat, -11dB for the sub) while the ambient layers keep the full
 * depth the rotation was built for. The front of the mix still rotates
 * exactly as before; what changes is that whichever layer is *behind* the
 * beat no longer takes the beat away with it.
 */
export const LAYER_FLOORS: Record<PresenceLayer, number> = {
  pad: PRESENCE_MIN,
  melody: PRESENCE_MIN,
  air: PRESENCE_MIN,
  sub: 0.28,
  pulse: 0.4,
};

/**
 * Where each layer sits in focus space: evenly around a ring the wandering
 * point can reach the edge of, so every layer both takes the front and
 * falls all the way back. Nothing sits at the centre — a layer parked near
 * the middle of the walk can never get far from the focus point, and the
 * pads were exactly that layer, which left the bed unable to recede when
 * receding is the whole effect.
 *
 * The ring order (pad, melody, air, pulse, sub) decides which layers share
 * the front, since neighbours rise together: pad under melody, pulse with
 * sub, sub under pad.
 */
const LAYER_POSITIONS: Record<PresenceLayer, readonly [number, number]> = {
  pad: [0.0, 1.0],
  melody: [0.95, 0.31],
  air: [0.59, -0.81],
  pulse: [-0.59, -0.81],
  sub: [-0.95, 0.31],
};

export const NEUTRAL_PRESENCE: LayerPresence = {
  pad: 1,
  melody: 1,
  air: 1,
  sub: 1,
  pulse: 1,
};

/**
 * The wandering focus point. Three incommensurate periods, so the path
 * never quite repeats — no audible cycle to lock onto. `periodScale`
 * stretches the whole walk: a fragment rotates once, an epic drifts.
 */
export function focusPointAt(
  t: number,
  periodScale = 1,
  drift: readonly [number, number] = [0, 0],
): [number, number] {
  const s = Math.max(0.05, periodScale);
  const x = 0.66 * Math.sin(t / (71 * s)) + 0.4 * Math.sin(t / (143 * s) + 1.7);
  const y = 0.66 * Math.cos(t / (97 * s)) + 0.4 * Math.sin(t / (167 * s) + 0.4);
  return [x + drift[0], y + drift[1]];
}

/**
 * Presence for every layer given a focus point. `spread` sets how many
 * layers are audible at once — small values give one soloed layer, large
 * values a flat mix. The nearest layer always lands exactly on
 * PRESENCE_MAX, which keeps the perceived level roughly steady while the
 * balance moves underneath it.
 */
export function presenceAt(
  point: readonly [number, number],
  spread = 0.8,
  silent: Partial<Record<PresenceLayer, boolean>> = {},
): LayerPresence {
  const twoSigmaSq = 2 * spread * spread;
  const raw = {} as Record<PresenceLayer, number>;
  let peak = 0;

  for (const layer of PRESENCE_LAYERS) {
    const [lx, ly] = LAYER_POSITIONS[layer];
    const dx = point[0] - lx;
    const dy = point[1] - ly;
    const value = Math.exp(-(dx * dx + dy * dy) / twoSigmaSq);
    raw[layer] = value;
    // A layer with nothing playing must not claim the front — half of all
    // movements carry no beat, and parking the focus on an empty pulse
    // layer would push everything audible into the background at once.
    if (!silent[layer] && value > peak) peak = value;
  }

  const out = {} as LayerPresence;
  for (const layer of PRESENCE_LAYERS) {
    // Normalising against the loudest *audible* layer is what keeps the
    // perceived level steady: whichever real layer is nearest the focus
    // point lands on PRESENCE_MAX even when the point is sitting on a
    // silent one. peak is an exponential over a bounded space so it is
    // never 0; the guard only covers a pathological spread.
    const norm = peak > 0 ? Math.min(1, raw[layer] / peak) : 1;
    // A silent layer takes the common floor whatever its own is — the
    // rhythmic floors exist to keep a beat that is *playing* audible, and
    // holding the pulse bus up on a movement with no beat on it would only
    // raise the noise floor of the bus.
    const floor = silent[layer] ? PRESENCE_MIN : LAYER_FLOORS[layer];
    out[layer] = floor + (PRESENCE_MAX - floor) * norm;
  }
  return out;
}
