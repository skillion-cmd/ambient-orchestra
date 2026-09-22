import * as Tone from 'tone';

/**
 * How the mix is stopped from going over — both halves of it.
 *
 * A limiter that catches everything it has time to react to, and, after it, a
 * static curve that catches what it doesn't. Neither is a creative effect;
 * they exist so that nothing this engine can be asked to do arrives at the
 * speakers as a clipped sample.
 */

/**
 * A limiter that actually limits.
 *
 * `Tone.Limiter` is a `Compressor` with the ratio turned up and the attack
 * turned down — and everything else left at the Compressor's defaults,
 * including `knee`, which is 30dB. A 30dB knee means the 20:1 slope is not
 * reached until 30dB *above* the threshold, so `new Tone.Limiter(-2)` is not
 * a ceiling at -2dBFS, it is a gentle suggestion that runs out somewhere
 * around +28. Measured on this engine's own output: a played kit peaking at
 * +3.5dBFS went through the master limiter and came out at +3.4dBFS, and
 * everything above 0 hard-clipped at the destination.
 *
 * Every limiter in this chain was one of those, which is why four separate
 * "its own limiter keeps this from eating the master's headroom" comments
 * were all describing something that was not happening.
 *
 * Same node and the same ratio, with the knee closed: past the threshold the
 * slope is 20:1 straight away, so the threshold is where the signal stops.
 * 1dB of knee is kept rather than none because a hard corner on a
 * DynamicsCompressorNode chatters on sustained material, and 1dB either way
 * is not audible. The release is slower than `Tone.Limiter`'s 10ms for the
 * same reason: at 10ms the gain reduction tracks individual cycles of a bass
 * note, which is distortion by another name.
 */
export function createLimiter(thresholdDb: number): Tone.Compressor {
  return new Tone.Compressor({
    threshold: thresholdDb,
    ratio: 20,
    knee: 1,
    attack: 0.003,
    release: 0.05,
  });
}

/** Where the ceiling curve flattens out — the highest sample that can leave. */
const CEILING = 0.92;
/** Below this the curve is exactly y = x, so normal material is untouched. */
const CEILING_KNEE = 0.72;

/**
 * The last thing in the chain, and the only one that cannot be walked through.
 *
 * A compressor-based limiter has an attack, and 3ms of attack is several
 * hundred samples during which a drum transient passes at whatever level it
 * arrived. That overshoot is small once the gain staging ahead of it is
 * right, but "small" is the wrong guarantee for the final node before the
 * speakers: past 1.0 the destination clips, and a clipped sample does not
 * sound like a loud sample, it sounds like a fault.
 *
 * So the chain ends in a static curve instead of another dynamics node.
 * Below `CEILING_KNEE` it is the identity — the mix normally sits 10dB under
 * that and never touches it — and above it bends over to `CEILING` and stays
 * there, including for everything the WaveShaper clamps in from beyond ±1.
 * At the limiter's own -2dBFS threshold the curve costs 0.03dB.
 *
 * Oversampled because a curve with a corner in it generates harmonics, and
 * harmonics above Nyquist fold back down as inharmonic tones — the thing it
 * is here to prevent.
 */
export function createCeiling(): Tone.WaveShaper {
  const shaper = new Tone.WaveShaper(ceilingCurve());
  shaper.oversample = '4x';
  return shaper;
}

/**
 * The transfer curve itself, separated so it can be checked without an audio
 * context — the property that matters is arithmetic, not acoustic.
 */
export function ceilingCurve(length = 2048): Float32Array {
  const curve = new Float32Array(length);
  const span = CEILING - CEILING_KNEE;
  for (let i = 0; i < length; i++) {
    const x = (i / (length - 1)) * 2 - 1;
    const magnitude = Math.abs(x);
    const shaped =
      magnitude <= CEILING_KNEE
        ? magnitude
        : CEILING_KNEE + span * Math.tanh((magnitude - CEILING_KNEE) / span);
    curve[i] = x < 0 ? -shaped : shaped;
  }
  return curve;
}

/** What the curve flattens to — the highest sample that can leave the chain. */
export const CEILING_PEAK = CEILING;
/** Below this the curve is the identity and the mix is untouched. */
export const CEILING_TRANSPARENT_BELOW = CEILING_KNEE;
