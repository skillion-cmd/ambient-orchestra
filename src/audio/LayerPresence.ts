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

/** Barely audible, but never gone — a layer recedes rather than drops out. */
export const PRESENCE_MIN = 0.18;
/** The front of the mix. Some layer is always here. */
export const PRESENCE_MAX = 1.15;

/**
 * Where each layer sits in focus space, spread around the origin so the
 * wandering point can visit each in turn. Pad sits nearest the centre: it
 * is the bed the others are heard against, so it is rarely fully absent.
 */
const LAYER_POSITIONS: Record<PresenceLayer, readonly [number, number]> = {
  pad: [0.0, 0.1],
  melody: [1.0, 0.15],
  air: [0.35, 1.0],
  sub: [-0.85, 0.55],
  pulse: [0.55, -0.9],
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
    out[layer] = PRESENCE_MIN + (PRESENCE_MAX - PRESENCE_MIN) * norm;
  }
  return out;
}
