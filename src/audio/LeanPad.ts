import * as Tone from 'tone';
import { planSteals } from './PolyVoices';

/**
 * A detuned-saw pad that costs the audio thread what it sounds like.
 *
 * The four saw pads were each a `Tone.PolySynth(Tone.MonoSynth)` with a
 * three-oscillator `fatsawtooth`, and a Tone voice is far heavier than the
 * sound it makes: every oscillator, filter and envelope carries its own
 * `Signal`s, so one pad note is 68 native nodes — 18 of them constant sources
 * that run every render quantum whether the note is sounding or not. Sixty
 * voices of that across the pads, plus the room next door, plus the release
 * tails of the last chord, is four to five thousand nodes for the audio
 * thread to walk 375 times a second. Measured in Chromium, that graph renders
 * at under half of real time on a machine that renders two thousand plain
 * nodes in real time. An audio thread that cannot finish a block in time
 * outputs a broken one — crackle that sounds like clipping — and one that
 * stays behind long enough can lose its output altogether.
 *
 * The sound of a pad note is three saws, a lowpass and an amp, plus the
 * filter envelope's own source and the square law MonoSynth puts on it
 * (`filterEnvelope.exponent` defaults to 2 — the cutoff follows the envelope
 * squared, which is most of why the swell sounds bowed rather than swept).
 * Seven nodes; that is all this builds. The envelopes are `Tone.Param`s
 * wrapped around native params — a JS-side timeline, no nodes of their own —
 * running Tone's `Envelope` arithmetic step for step (linear attack resumed
 * from wherever the level already is, exponential approach for decay and
 * release), and the saws are FatOscillator's: one plain saw and the rest from
 * Tone's own partial series at their phase offsets. So a note here rises,
 * swells its filter and dies as the MonoSynth one did.
 *
 * Voices are allocated per strike and torn down when their release ends,
 * which is cheap at seven nodes. Polyphony is still capped — what is sounding
 * is what costs CPU — and a strike past the cap re-strikes voices on their
 * way out by the same rule `attackWithSteal` applies to the PolySynths, so
 * no chord tone is ever dropped.
 */

export interface LeanPadOptions {
  /** Total detune spread across the saws, in cents (FatOscillator `spread`). */
  spread: number;
  /** Saws per note (FatOscillator `count`). */
  count: number;
  envelope: Adsr;
  filterEnvelope: Adsr & { baseFrequency: number; octaves: number };
  /** Lowpass resonance — MonoSynth's `filter.Q` at a -12dB rolloff. */
  Q: number;
  maxPolyphony: number;
}

interface Adsr {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

/** Below this an envelope is silent — PolySynth's own threshold for "free". */
const SILENT = 1e-4;

class PadNote {
  readonly amp: Tone.Param<'number'>;
  /** The filter envelope, 0–1, before the square law. */
  readonly sweep: Tone.Param<'number'>;
  private readonly oscs: OscillatorNode[];
  private readonly sweepSource: ConstantSourceNode;
  private readonly shaper: WaveShaperNode;
  private readonly filter: BiquadFilterNode;
  private readonly gain: GainNode;
  midi: number;
  released = false;
  /** When the oscillators are due to stop — the release's end. */
  private stopAt = Infinity;
  private stopped = false;

  constructor(
    private readonly ctx: Tone.BaseContext,
    private readonly opts: LeanPadOptions,
    destination: AudioNode,
    sweepCurve: Float32Array<ArrayBuffer>,
    midi: number,
    detune: number,
    private readonly onEnded: (note: PadNote) => void,
  ) {
    this.midi = midi;
    const raw = ctx.rawContext as unknown as BaseAudioContext;
    this.gain = raw.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(destination);
    this.filter = raw.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = opts.Q;
    // FrequencyEnvelope's Scale: the cutoff rests at the base and the shaped
    // envelope adds the rest of the range on top.
    this.filter.frequency.value = opts.filterEnvelope.baseFrequency;
    this.filter.connect(this.gain);
    this.sweepSource = raw.createConstantSource();
    this.sweepSource.offset.value = 0;
    this.shaper = raw.createWaveShaper();
    this.shaper.curve = sweepCurve;
    this.sweepSource.connect(this.shaper);
    this.shaper.connect(this.filter.frequency);

    this.amp = new Tone.Param({ context: ctx, param: this.gain.gain, value: 0 });
    this.sweep = new Tone.Param({ context: ctx, param: this.sweepSource.offset, value: 0 });

    const freq = Tone.Frequency(midi, 'midi').toFrequency();
    const { spread, count } = opts;
    this.oscs = [];
    for (let i = 0; i < count; i++) {
      const osc = raw.createOscillator();
      // FatOscillator staggers its saws' phases around the cycle. Tone plays
      // a zero-phase saw natively and builds every other phase from its own
      // partial series, which is not quite the native saw's level — so the
      // same is done here rather than a native saw for all three.
      if (i === 0) osc.type = 'sawtooth';
      else osc.setPeriodicWave(phasedSaw(raw, (i / count) * 2 * Math.PI));
      osc.frequency.value = freq;
      osc.detune.value = spreadDetune(spread, count, i) + detune;
      osc.connect(this.filter);
      this.oscs.push(osc);
    }
    this.oscs[0]!.onended = () => this.teardown();
  }

  /** Start the sources — once, at the first attack. */
  start(time: number): void {
    for (const osc of this.oscs) osc.start(time);
    this.sweepSource.start(time);
  }

  /** Re-tune for a re-strike onto a different pitch (a steal). */
  retune(midi: number, time: number): void {
    if (midi === this.midi) return;
    this.midi = midi;
    const freq = Tone.Frequency(midi, 'midi').toFrequency();
    for (const osc of this.oscs) osc.frequency.setValueAtTime(freq, time);
  }

  setDetune(detune: number, time: number): void {
    this.oscs.forEach((osc, i) =>
      osc.detune.setValueAtTime(spreadDetune(this.opts.spread, this.opts.count, i) + detune, time),
    );
  }

  attack(time: number, velocity: number): void {
    this.released = false;
    // A later stop() replaces an earlier one on a source that has not ended
    // yet, so a re-struck tail simply stops being due to stop.
    this.scheduleStop(Number.MAX_SAFE_INTEGER);
    envelopeAttack(this.amp, this.opts.envelope, time, velocity);
    // MonoSynth triggers its filter envelope without the velocity.
    envelopeAttack(this.sweep, this.opts.filterEnvelope, time, 1);
  }

  release(time: number): void {
    if (this.released) return;
    this.released = true;
    envelopeRelease(this.amp, this.opts.envelope, time);
    envelopeRelease(this.sweep, this.opts.filterEnvelope, time);
    this.scheduleStop(time + this.opts.envelope.release);
  }

  levelAt(time: number): number {
    return this.amp.getValueAtTime(time);
  }

  /** True once nothing more can come out of this note. */
  isDone(time: number): boolean {
    return this.stopped || (this.released && time >= this.stopAt);
  }

  private scheduleStop(time: number): void {
    if (this.stopped) return;
    this.stopAt = time;
    for (const osc of this.oscs) osc.stop(time);
    this.sweepSource.stop(time);
  }

  /** Stop now and let go of every node. Safe to call more than once. */
  teardown(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const osc of this.oscs) {
      osc.onended = null;
      try {
        osc.stop();
      } catch {
        /* never started */
      }
      osc.disconnect();
    }
    try {
      this.sweepSource.stop();
    } catch {
      /* never started */
    }
    this.sweepSource.disconnect();
    this.shaper.disconnect();
    this.filter.disconnect();
    this.gain.disconnect();
    this.amp.dispose();
    this.sweep.dispose();
    this.onEnded(this);
  }
}

export class LeanPad extends Tone.ToneAudioNode {
  readonly name: string = 'LeanPad';
  readonly input = undefined;
  readonly output: Tone.Gain;
  maxPolyphony: number;
  private readonly opts: LeanPadOptions;
  /** Every note that can still sound, oldest first. */
  private notes: PadNote[] = [];
  private detune = 0;
  /** The filter envelope's square law, scaled to the sweep's range. */
  private readonly sweepCurve: Float32Array<ArrayBuffer>;

  constructor(opts: LeanPadOptions) {
    super({ context: Tone.getContext() });
    this.opts = opts;
    this.maxPolyphony = opts.maxPolyphony;
    // FatOscillator sets each of its saws to `-6 - count * 1.1` dB. The
    // filter and amp are linear, so that trim is taken once here instead of
    // once per saw.
    this.output = new Tone.Gain({
      context: this.context,
      gain: Tone.dbToGain(-6 - opts.count * 1.1),
    });
    const fe = opts.filterEnvelope;
    this.sweepCurve = sweepCurve(fe.baseFrequency * (Math.pow(2, fe.octaves) - 1));
  }

  /**
   * Strike `notes` at `time`. A note already held is re-articulated rather
   * than doubled, as PolySynth does; past `maxPolyphony` the shortfall is
   * taken from voices on their way out — see `planSteals`.
   */
  triggerAttack(notes: string | readonly string[], time?: Tone.Unit.Time, velocity = 1): this {
    const t = this.toSeconds(time);
    const list = typeof notes === 'string' ? [notes] : notes;
    this.prune(t);
    const midis: number[] = [];
    for (const name of list) {
      const midi = Tone.Frequency(name).toMidi();
      const held = this.notes.find((n) => n.midi === midi && !n.released);
      if (held) held.attack(t, velocity);
      else midis.push(midi);
    }
    if (!midis.length) return this;

    const audible = this.notes.filter((n) => n.levelAt(t) > SILENT);
    const candidates = [...audible.filter((n) => n.released), ...audible.filter((n) => !n.released)];
    const free = this.maxPolyphony - audible.length;
    const { steals, fresh } = planSteals(
      candidates.map((n) => n.midi),
      free,
      midis,
    );
    const restruck: PadNote[] = [];
    for (const [h, i] of steals) {
      const note = candidates[h]!;
      note.retune(midis[i]!, t);
      note.attack(t, velocity);
      restruck.push(note);
    }
    // A re-struck voice is the newest note now; the next steal takes it last.
    this.notes = this.notes.filter((n) => !restruck.includes(n)).concat(restruck);
    for (const i of fresh) {
      const note = new PadNote(
        this.context,
        this.opts,
        this.output.input as unknown as AudioNode,
        this.sweepCurve,
        midis[i]!,
        this.detune,
        (n) => (this.notes = this.notes.filter((x) => x !== n)),
      );
      note.start(t);
      note.attack(t, velocity);
      this.notes.push(note);
    }
    return this;
  }

  releaseAll(time?: Tone.Unit.Time): this {
    const t = this.toSeconds(time);
    for (const note of this.notes) note.release(t);
    return this;
  }

  /** PolySynth's `set({ detune })`, the one setting a pad changes live. */
  setDetune(cents: number): this {
    this.detune = cents;
    const now = this.now();
    for (const note of this.notes) note.setDetune(this.detune, now);
    return this;
  }

  /** Notes still able to sound — for tests and the dev handle. */
  get activeVoices(): number {
    this.prune(this.now());
    return this.notes.length;
  }

  dispose(): this {
    super.dispose();
    for (const note of [...this.notes]) note.teardown();
    this.notes = [];
    this.output.dispose();
    return this;
  }

  /** Drop notes whose oscillators have already been told to stop by now. */
  private prune(time: number): void {
    for (const note of [...this.notes]) if (note.isDone(time)) note.teardown();
  }
}

/** FatOscillator's spread: `count` saws evenly across `spread` cents. */
export function spreadDetune(spread: number, count: number, index: number): number {
  if (count <= 1) return 0;
  return -spread / 2 + (spread / (count - 1)) * index;
}

/**
 * `Tone.Pow(2)` into `Tone.Scale`, as one curve: `range * |x|^2` over the
 * shaper's -1..1 input, at the 1024 points Tone's WaveShaper maps with.
 */
export function sweepCurve(range: number, length = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const x = (i / (length - 1)) * 2 - 1;
    curve[i] = range * x * x;
  }
  return curve;
}

/**
 * Tone's sawtooth at a phase offset: its 2048-partial series, rotated, as
 * `Oscillator._getRealImaginary` builds it. One per phase per context.
 */
const phasedSaws = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();
function phasedSaw(ctx: BaseAudioContext, phase: number): PeriodicWave {
  let byPhase = phasedSaws.get(ctx);
  if (!byPhase) phasedSaws.set(ctx, (byPhase = new Map()));
  const cached = byPhase.get(phase);
  if (cached) return cached;
  const size = 2048;
  const real = new Float32Array(size);
  const imag = new Float32Array(size);
  for (let n = 1; n < size; n++) {
    const b = (2 / (n * Math.PI)) * (n & 1 ? 1 : -1);
    real[n] = -b * Math.sin(phase * n);
    imag[n] = b * Math.cos(phase * n);
  }
  const wave = ctx.createPeriodicWave(real, imag);
  byPhase.set(phase, wave);
  return wave;
}

/**
 * `Tone.Envelope.triggerAttack` with its default curves, on a 0–1 param:
 * a linear attack, shortened by however far the level has already risen,
 * then an exponential approach to the sustain.
 */
function envelopeAttack(param: Tone.Param<'number'>, env: Adsr, time: number, velocity: number): void {
  const current = param.getValueAtTime(time);
  let attack = env.attack;
  if (current > 0) attack = (1 - current) * env.attack;
  if (attack < param.sampleTime) {
    param.cancelScheduledValues(time);
    param.setValueAtTime(velocity, time);
  } else {
    param.linearRampTo(velocity, attack, time);
  }
  if (env.decay && env.sustain < 1) {
    param.exponentialApproachValueAtTime(velocity * env.sustain, time + attack, env.decay);
  }
}

/** `Tone.Envelope.triggerRelease` with its default exponential curve. */
function envelopeRelease(param: Tone.Param<'number'>, env: Adsr, time: number): void {
  if (param.getValueAtTime(time) <= 0) return;
  if (env.release < param.sampleTime) param.setValueAtTime(0, time);
  else param.targetRampTo(0, env.release, time);
}
