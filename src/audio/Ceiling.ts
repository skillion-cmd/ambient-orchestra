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
 * around +28. So the knee is closed here: past the threshold the slope is
 * 20:1 straight away. 1dB of knee is kept rather than none because a hard
 * corner on a DynamicsCompressorNode chatters on sustained material, and 1dB
 * either way is not audible. The release is slower than `Tone.Limiter`'s
 * 10ms for the same reason: at 10ms the gain reduction tracks individual
 * cycles of a bass note, which is distortion by another name.
 *
 * Closing the knee was half of it. The other half is that a
 * DynamicsCompressorNode is not allowed to leave its output alone: the Web
 * Audio spec has it apply *makeup gain* — `(1 / curve(1.0)) ^ 0.6`, the gain
 * that would bring a full-scale input back towards full scale — and there is
 * no parameter to turn it off. The deeper the threshold, the more it adds:
 * measured through this exact configuration in Chrome, +1.0dB at -2, +3.3dB
 * at -6 and +4.4dB at -8. So the limiters were limiting and then turning the
 * result back up. The -2dB master let a hot input out at +0.1dBFS; the -6dB
 * kit limiter peaked at -2.4. Stacked, they fed the master far enough past
 * its threshold that every kick pulled the whole mix down by up to 10dB —
 * the sound dropping out — and what the master let through sat inside the
 * ceiling curve's bend, which is the other name for distortion.
 *
 * Here the makeup is computed from the same curve the browser uses and taken
 * back off after the compressor, so the threshold is the ceiling. The same
 * amount is applied *before* it, which leaves everything under the threshold
 * at exactly the level it has always had — every bus trim and kit level in
 * the engine was voiced through that makeup, and this is a fix to the
 * ceiling, not a remix.
 */
export class Limiter extends Tone.ToneAudioNode {
  readonly name: string = 'Limiter';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;
  private readonly compressor: Tone.Compressor;

  constructor(thresholdDb: number) {
    super({ context: Tone.getContext() });
    const makeup = compressorMakeupGain(thresholdDb, LIMITER_KNEE_DB, LIMITER_RATIO);
    this.input = new Tone.Gain({ context: this.context, gain: makeup });
    this.compressor = new Tone.Compressor({
      context: this.context,
      threshold: thresholdDb,
      ratio: LIMITER_RATIO,
      knee: LIMITER_KNEE_DB,
      attack: 0.003,
      release: 0.05,
    });
    this.output = new Tone.Gain({ context: this.context, gain: 1 / makeup });
    this.input.chain(this.compressor, this.output);
  }

  dispose(): this {
    super.dispose();
    this.input.dispose();
    this.compressor.dispose();
    this.output.dispose();
    return this;
  }
}

const LIMITER_RATIO = 20;
const LIMITER_KNEE_DB = 1;

export function createLimiter(thresholdDb: number): Limiter {
  return new Limiter(thresholdDb);
}

const dbToLinear = (db: number) => Math.pow(10, db / 20);
const linearToDb = (x: number) => 20 * Math.log10(x);

/**
 * The makeup gain a DynamicsCompressorNode applies to its own output, as a
 * linear factor.
 *
 * This is the static curve from the Web Audio spec, which is also exactly
 * what Chromium, Firefox and WebKit run (they share the implementation): a
 * straight line to the threshold, an exponential knee whose steepness `k` is
 * searched for so that it meets the `1/ratio` slope at the knee's end, and
 * that slope beyond. The makeup is the full-range gain of that curve,
 * inverted, to the power 0.6. The search is theirs step for step, so the
 * number matches theirs rather than a cleaner closed form that would be off
 * by a fraction of a dB.
 */
export function compressorMakeupGain(thresholdDb: number, kneeDb: number, ratio: number): number {
  const linearThreshold = dbToLinear(thresholdDb);
  const kneeEndDb = thresholdDb + kneeDb;
  const linearKneeEnd = dbToLinear(kneeEndDb);
  const slope = 1 / ratio;

  const kneeCurve = (x: number, k: number) =>
    x < linearThreshold ? x : linearThreshold + (1 - Math.exp(-k * (x - linearThreshold))) / k;

  const slopeAt = (x: number, k: number) => {
    if (x < linearThreshold) return 1;
    const x2 = x * 1.001;
    const y = kneeCurve(x, k);
    const y2 = kneeCurve(x2, k);
    return (linearToDb(y2) - linearToDb(y)) / (linearToDb(x2) - linearToDb(x));
  };

  let minK = 0.1;
  let maxK = 10000;
  let k = 5;
  for (let i = 0; i < 15; i++) {
    if (slopeAt(linearKneeEnd, k) < slope) maxK = k;
    else minK = k;
    k = Math.sqrt(minK * maxK);
  }

  const kneeEndOutDb = linearToDb(kneeCurve(linearKneeEnd, k));
  const saturate = (x: number) =>
    x < linearKneeEnd ? kneeCurve(x, k) : dbToLinear(kneeEndOutDb + slope * (linearToDb(x) - kneeEndDb));

  return Math.pow(1 / saturate(1), 0.6);
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
